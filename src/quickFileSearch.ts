import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { FileItem, MessageItem } from "./customQuickPickItem";

export async function quickOpen() {
	const uri = await pickFile();
	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
	}
}

function partition<T>(array: readonly T[], predicate: (elem: T) => boolean): [T[], T[]] {
  return array.reduce((result, value) => (
    result[predicate(value) ? 0 : 1].push(value), result
  ), <[T[], T[]]>[[], []]);
}


/**
 * Return opened workspace folders / current directory if no workspace are opened
 *
 * @returns {string[]}
 */
function getSafeCwds() : string[] {
  return vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders.map(f => f.uri.fsPath)
    : [process.cwd()];
}

/**
 * Return quote char in terminal of each platform
 *
 * @returns {string}
 */
// function getQuoteChar() : string {
//   return process.platform === 'win32' ? '"' : '\'';
// }

function getSearchCommand(rawQuery: string) : { searchCommands: string[], rawQuery: string } {
  // const quoteChar = getQuoteChar();
  const options = ["-0", "--no-line-number", "--no-heading", "--type md"];
  const tagPrefix = "#";
  
  const words = rawQuery.split(/\s+/).filter(s => s);
  if(!words.length) { return { searchCommands: [], rawQuery } ; }
  
  const [tagWords, keyWords] = partition(words, (w => w.charAt(0) === tagPrefix));
  
  // タグはOR検索(|で繋いで一度に検索する)
  const tagSearchCommands =
    tagWords.length ?
      [`rg ${options.join(" ")} '^tags\\s*:\\s*\\[[^\\]]*(${tagWords.map(t => t.substring(1)).join("|")})[^\\]]*\\]$'`] :
      [];
  // rg  'hoge'

  // キーワードはAND検索
  const keyWordCommands =
    keyWords.length ? 
      keyWords.map(keyWord => {
        return `rg ${options.join(" ")} '${keyWord}'`;
      }) :
      [];
  
  // ファイル名にマッチさせたい = globで検索して，結合する．GLOBでANDは難しいので，各wordで検索した結果のLISTを結合が必要
  
  const searchCommands = tagSearchCommands.concat(keyWordCommands);
  
  return { searchCommands, rawQuery };
}

// function createFileItems(cwd: string, stdout: string): FileItem[] {
//   return stdout
//     .split('\n').slice(0, 50)
//     .map(relative => new FileItem(cwd, vscode.Uri.file(path.join(cwd, relative))));
// }

function createMessageItem(cwd: string, message: string): MessageItem {
  return new MessageItem(cwd, message);
}

interface SearchProcess {
  commandText: string;
  cwd: string;
  rgProcess: cp.ChildProcess;  
}

function intersectArrays<T>(arr1: T[], arr2: T[], predicate: (elm1: T, elm2: T) => boolean): T[] {
  return arr1.filter(elm1 => arr2.findIndex(elm2 => predicate(elm1, elm2)) !== -1);
}

function uniqBy<T>(a: T[], key: (elm: T) => string | number | symbol): T[]{
    var seen = new Set();
    return a.filter(item => {
        var k = key(item);
        return seen.has(k) ? false : (seen.add(k));
    });
}

class FoundItemManager {
  constructor(private input: vscode.QuickPick<FileItem | MessageItem>) {
    
  }
  
  private parseCommandResult(base: string, stdout: string, rawQuery: string): FileItem[] {
    const items = stdout.split("\n")
      .map(line => {
        const [ fileName, contents ] = line.split("\0");
        return { fileName, contents };
      });
    
    return uniqBy(items, item => item.fileName)
      .map(relative => new FileItem(base, vscode.Uri.file(path.join(base, relative.fileName)), relative.contents + " " + rawQuery));
  }
  
  public Clear() {
    this.input.items = [];
  }
  
  // cwd無いのANDを全部盗らないといけない．一部がKILLされたとき．incrementalであれば，どんどん追加して徐々に絞ってもいいか
  public AddFileItem(cwd: string, _: string, stdout: string, rawQuery: string) {
    const newFileItems: FileItem[] = this.parseCommandResult(cwd, stdout, rawQuery);
    
    console.log({command: _});
    
    if(this.input.items.length !== 0) {
      // 同じCWD内のデータがあればFilterする / なければ全て追加
      const [ sameBaseItems, otherBaseItems ] = partition(this.input.items, item => item.base === cwd);
      
      // TODO: workspaceでソート順を固定
      this.input.items = 
        otherBaseItems.concat(
          intersectArrays(sameBaseItems as FileItem[], newFileItems, (item1, item2) => item1.fileName === item2.fileName)
        );
    } else {
      this.input.items = newFileItems;
    }
    
    console.log(this.input.items);
  }
}

async function pickFile() 
{
	const disposables: vscode.Disposable[] = [];
	try {
		return await new Promise<vscode.Uri | undefined>((resolve, _) => {
      
      const cwds = getSafeCwds();
      
			const input = vscode.window.createQuickPick<FileItem | MessageItem>();
      input.ignoreFocusOut = true;
      input.matchOnDescription = true;
      
			input.placeholder = 'Type to search for files';
			
      let rgs: SearchProcess[] = [];
      
			disposables.push(
				input.onDidChangeValue((value: string) => {
          // Kill previously invoked processes
					rgs.forEach(rg => rg.rgProcess.kill());
          
          // Empty list if no search query
					if (!value) {
						input.items = [];
						return;
					}
          
          const { searchCommands, rawQuery } = getSearchCommand(value);
          
          // Set busy while `rg` processes are executing
					input.busy = true;
          let isFirst = true;
          
          const itemManager = new FoundItemManager(input);
          
          // 2. Assign executing ChildProcess instances to a variable `rgs`
					rgs = (<SearchProcess[]>[]).concat(...cwds.map(cwd => {
            return searchCommands.map(commandText => {
              // 1. Start execution of rg commands
              const rgProcess = cp.exec(commandText, { cwd }, (err, stdout) => {
                // 3. This block was invoked when each child process was terminated
                const i = rgs.findIndex(pr => pr.rgProcess === rgProcess);
                // Confirm this process is not killed previously (and `rgs` was overwritten when the next `onDidChangeValue` invocation, so this proceess does not exists in `rgs`)
                if (i === -1) { return; }
                
                if (isFirst) {
                  // If the first termination of rg command with regard to current `onDidChangeValue`, clear QuickPickItems
                  itemManager.Clear();
                  isFirst = false;
                }
                
                if (!err) {
                  // If no errors, append found items to QuickPickItems
                  itemManager.AddFileItem(cwd, commandText, stdout, rawQuery);
                }
                
                if (err && err.killed && err.code !== 1 && err.message) {
                  // If errors occured and process was not killed (and error message exists), show error message
                  input.items = input.items.concat([createMessageItem(cwd, err.message)]);
                }
                
                // Remove this terminated process from `rgs`
                rgs.splice(i, 1);
                
                if (!rgs.length) {
                  // If all processes were terminated, set as `not busy`
                  input.busy = false;
                }
              });
              
						  return { commandText, cwd, rgProcess };
            });
					}));
				}),
        
				input.onDidChangeSelection(items => {
					const item = items[0];
					if (item instanceof FileItem) {
						resolve(item.uri);
						input.hide();
					}
				}),
        
				input.onDidHide(() => {
					rgs.forEach(rg => rg.rgProcess.kill());
					resolve(undefined);
					input.dispose();
				})
			);
      
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}
