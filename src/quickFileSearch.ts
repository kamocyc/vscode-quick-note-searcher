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
function getQuoteChar() : string {
  return process.platform === 'win32' ? '"' : '\'';
}

function getSearchCommand(rawQuery: string) : string[] {
  const quoteChar = getQuoteChar();
  
  // markdownのタグ検索
  return [`rg --files -g ${quoteChar}*${rawQuery}*${quoteChar}`];
}

async function pickFile() 
{
	const disposables: vscode.Disposable[] = [];
	try {
		return await new Promise<vscode.Uri | undefined>((resolve, _) => {
      
      const cwds = getSafeCwds();
      
			const input = vscode.window.createQuickPick<FileItem | MessageItem>();
			input.placeholder = 'Type to search for files';
			
      let rgs: cp.ChildProcess[] = [];
      
			disposables.push(
				input.onDidChangeValue((value: string) => {
          // Kill previously invoked processes
					rgs.forEach(rg => rg.kill());
          
          // Empty list if no search query
					if (!value) {
						input.items = [];
						return;
					}
          
          const searchCommands = getSearchCommand(value);
          
          // Set busy while `rg` processes are executing
					input.busy = true;
          let isFirst = true;
          
          // 2. Assign executing ChildProcess instances to a variable `rgs`
					rgs = (<cp.ChildProcess[]>[]).concat(...cwds.map(cwd => {
            return searchCommands.map(searchCommand => {
              // 1. Start execution of rg commands
              const rg = cp.exec(searchCommand, { cwd }, (err, stdout) => {
                // 3. This block was invoked when each child process was terminated
                const i = rgs.indexOf(rg);
                // Confirm this process is not killed previously (and `rgs` was overwritten when the next `onDidChangeValue` invocation, so this proceess does not exists in `rgs`)
                if (i !== -1) {
                  if (isFirst) {
                    // If the first termination of rg command with regard to current `onDidChangeValue`, clear QuickPickItems
                    input.items = [];
                    isFirst = false;
                  }
                  
                  if (!err) {
                    // If no errors, append found items to QuickPickItems
                    input.items = input.items.concat(
                      stdout
                        .split('\n').slice(0, 50)
                        .map(relative => new FileItem(vscode.Uri.file(cwd), vscode.Uri.file(path.join(cwd, relative))))
                    );
                  }
                  
                  if (err && !(<any>err).killed && (<any>err).code !== 1 && err.message) {
                    // If errors occured and process was not killed (and error message exists), show error message
                    input.items = input.items.concat([
                      new MessageItem(vscode.Uri.file(cwd), err.message)
                    ]);
                  }
                  
                  // Remove this terminated process from `rgs`
                  rgs.splice(i, 1);
                  
                  if (!rgs.length) {
                    // If all processes were terminated, set as `not busy`
                    input.busy = false;
                  }
                }
              });
              
						  return rg;
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
					rgs.forEach(rg => rg.kill());
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
