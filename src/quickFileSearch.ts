import { debounce } from 'debounce';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { FileItem, MessageItem, SearcherItem } from "./customQuickPickItem";
import { intersectArrays, partition, uniqueBy, SetWith, flatten } from "./util";
import { getFlattenedSearchCommands } from "./searchQueryParser";

export async function quickOpen() {
	const uri = await pickFile();
	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
	}
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
 * Unique key "or-set"
 */
type ResultOrKey = { cwd: string, orIndex: number };

/**
 * Debounce search result
 */
class QuickPickItemManager<T extends vscode.QuickPickItem> {
  private bufferedItems: readonly T[];
  
  constructor(private input: vscode.QuickPick<T>) {
    this.bufferedItems = input.items;
  }
  
  private setItems = debounce(() => this.input.items = this.bufferedItems, 20);
  
  public set(items: T[]) {
    this.bufferedItems = items;
    this.setItems(); 
  }
  
  public get items(): readonly T[] {
    return this.bufferedItems;
  }
}

class FoundItemManager {
  // Set to remember alreadly first added "or-sets"
  private notFirstSet: SetWith<ResultOrKey>;
  
  constructor(private itemManager: QuickPickItemManager<SearcherItem>) {  
    this.notFirstSet =
      new SetWith(({cwd, orIndex}, { cwd: cwd_, orIndex: orIndex_ }) => cwd_ === cwd && orIndex_ === orIndex);
  }
  
  /**
   * Remove duplicates of items, in terms of fileName
   * @param items items
   */
  private uniqItems(items: SearcherItem[]): SearcherItem[] {
    return uniqueBy(items, item => item instanceof MessageItem ? item.message : item.fileName);
  }
  
  /**
   * Parse a result of a command.
   * @param stdout stdout of the command
   * @param command text of the invoked command itself
   */
  private parseCommandResult(stdout: string, command: string): { fileName: string, contents: string }[] {
    const isFilesCommand = command.indexOf("--files") !== -1;
    
    const items = stdout.split("\n")
      .filter(line => line.trim())
      .map(line => {
        // If file name search, its content is not included in stdout.
        const [ fileName, contents ] = isFilesCommand ? [ line, "" ] : line.split("\0");
        return { fileName, contents };
      });
    
    return uniqueBy(items, item => item.fileName);
  }
  
  /**
   * Clear items of QuickPickList. If a key is specified, remove only matched items.
   */
  public Clear(orKey?: ResultOrKey) {
    if(orKey === undefined) {
      this.itemManager.set([]);
    } else {
      this.itemManager.set(this.itemManager.items.filter(item =>
        !(item instanceof FileItem && item.base === orKey.cwd && item.orIndex === orKey.orIndex))
      );
    }
    
    console.log( "Clear!" );
    console.log( { resultItems: this.itemManager.items });
  }
  
  // cwd無いのANDを全部とらないといけない．一部がKILLされたとき．incrementalであれば，どんどん追加して徐々に絞ってもいいか
  public AddFileItem(cwd: string, orIndex: number, command: string, stdout: string, rawQuery: string) {
    const newFileItems: FileItem[] =
      this
      .parseCommandResult(stdout, command)
      .map(relative =>
        new FileItem(cwd, vscode.Uri.file(path.join(cwd, relative.fileName)), relative.contents + " " + rawQuery, orIndex)
      );
    
    console.log({command});
    
    if(!this.notFirstSet.has({cwd, orIndex})) {
      // First occurence of this "or-set"
      this.itemManager.set(this.uniqItems(this.itemManager.items.concat(newFileItems)));
      this.notFirstSet.add({cwd, orIndex});
    } else {
      // 同じCWD内のデータがあればFilterする / なければ全て追加
      const [ sameBaseItems, otherBaseItems ] = partition(this.itemManager.items, item => item instanceof FileItem && item.base === cwd && item.orIndex === orIndex);
      
      // TODO: 各OR-setごとにソート順を固定
      this.itemManager.set( 
        this.uniqItems(otherBaseItems.concat(
          intersectArrays(sameBaseItems as FileItem[], newFileItems, (item1, item2) => item1.fileName === item2.fileName)
        )));
    }
    
    console.log( { resultItems: this.itemManager.items });
  }
}

class PickFileInputEventHandler {
  private readonly cwds: string[];
  private rgProcesses: cp.ChildProcess[];
  
  constructor(
      private readonly input: vscode.QuickPick<SearcherItem>,
      private readonly resolve: (value?: vscode.Uri | PromiseLike<vscode.Uri | undefined> | undefined) => void) {
    this.cwds = getSafeCwds();
    this.rgProcesses = [];
  }
  
  public onDidChangeValue = (rawQuery: string) => {
    // Kill previously invoked processefs
    this.rgProcesses.forEach(rg => rg.kill());
    
    // Empty list if no search query
    if (!rawQuery) {
      this.input.items = [];
      return;
    }
    
    // Create search commands
    const searchCommands = getFlattenedSearchCommands(rawQuery);
    
    // Set "busy" while `rg` processes are executing
    this.input.busy = true;
    let isFirst = true;
    
    const itemManager = new FoundItemManager(new QuickPickItemManager(this.input));
    
    // 2. Assign executing ChildProcess instances to a variable `rgs`
    this.rgProcesses = flatten(this.cwds.map(cwd => {
      return searchCommands.map(({ commandText, index }) => {
        // 1. Start execution of rg commands
        const rgProcess = cp.exec(commandText, { cwd }, (err, stdout) => {
          // 3. This block was invoked when each child process was terminated
          const i = this.rgProcesses.findIndex(pr => pr === rgProcess);
          // Confirm this process is not killed previously (and `rgs` was overwritten when the next `onDidChangeValue` invocation, so this proceess does not exists in `rgs`)
          if (i === -1) { return; }
          
          if (isFirst) {
            // If the first termination of rg command with regard to current `onDidChangeValue`, clear QuickPickItems
            itemManager.Clear();
            isFirst = false;
          }
          
          if (!err) {
            // If no errors, append found items to QuickPickItems
            itemManager.AddFileItem(cwd, index, commandText, stdout, rawQuery);
          }
          
          if(err && !err.killed && err.code === 1) {
            // Clear list when exit code 1 (means "no results". See https://github.com/BurntSushi/ripgrep/issues/948))
            itemManager.Clear({ cwd, orIndex: index });
          }
          
          if (err && !err.killed && err.code !== 1 && err.message) {
            // If errors occured and process was not killed (and error message exists), show error message
            this.input.items = this.input.items.concat([new MessageItem(cwd, err.message)]);
          }
          
          // Remove this terminated process from `rgs`
          this.rgProcesses.splice(i, 1);
          
          if (!this.rgProcesses.length) {
            // If all processes were terminated, set as `not busy`
            this.input.busy = false;
          }
        });
        
        return rgProcess;
      });
    }));
  }
  
  public onDidChangeSelection = (items: (SearcherItem)[]) => {
    const item = items[0];
    if (item instanceof FileItem) {
      this.resolve(item.uri);
      this.input.hide();
    }
  }
  
  public onDidHide = () => {
    this.rgProcesses.forEach(rg => rg.kill());
    this.resolve(undefined);
    this.input.dispose();
  }
}

async function pickFile() 
{
	const disposables: vscode.Disposable[] = [];
	try {
		return await new Promise<vscode.Uri | undefined>((resolve, _) => {
      const input = vscode.window.createQuickPick<SearcherItem>();
      
      input.ignoreFocusOut = true;
      input.matchOnDescription = true;
      
      input.placeholder = 'Type to search for files';
      
      const inputHandler = new PickFileInputEventHandler(input, resolve);
      
      disposables.push(
        input.onDidChangeSelection(debounce((items: (SearcherItem)[]) => inputHandler.onDidChangeSelection(items), 500)),
        input.onDidChangeValue(inputHandler.onDidChangeValue),
        input.onDidHide(inputHandler.onDidHide)
      );
      
      input.show();
    });
	} finally {
		disposables.forEach(d => d.dispose());
	}
}
