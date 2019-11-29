import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';

export async function quickOpen() {
	const uri = await pickFile();
	if (uri) {
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
	}
}

class FileItem implements vscode.QuickPickItem {

	label: string;
	description: string;
	
	constructor(public base: vscode.Uri, public uri: vscode.Uri) {
		this.label = path.basename(uri.fsPath);
		this.description = path.dirname(path.relative(base.fsPath, uri.fsPath));
	}
}

class MessageItem implements vscode.QuickPickItem {

	label: string;
	description = '';
	detail: string;
	
	constructor(public base: vscode.Uri, public message: string) {
		this.label = message.replace(/\r?\n/g, ' ');
		this.detail = base.fsPath;
	}
}

function getSafeCwds() : string[] {
  return vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders.map(f => f.uri.fsPath)
    : [process.cwd()];
}

async function pickFile() 
{
	const disposables: vscode.Disposable[] = [];
	try {
		return await new Promise<vscode.Uri | undefined>((resolve, reject) => {
			const input = vscode.window.createQuickPick<FileItem | MessageItem>();
			input.placeholder = 'Type to search for files';
			
      let rgs: cp.ChildProcess[] = [];
      
			disposables.push(
				input.onDidChangeValue((value: string) => {
					rgs.forEach(rg => rg.kill());
          
					if (!value) {
						input.items = [];
						return;
					}
          
					input.busy = true;
          
					const cwds = getSafeCwds();
					const quoteChar = process.platform === 'win32' ? '"' : '\'';
          
					rgs = cwds.map(cwd => {
						const rg = cp.exec(`rg --files -g ${quoteChar}*${value}*${quoteChar}`, { cwd }, (err, stdout) => {
							const i = rgs.indexOf(rg);
							if (i !== -1) {
								if (rgs.length === cwds.length) {
									input.items = [];
								}
                
								if (!err) {
									input.items = input.items.concat(
										stdout
											.split('\n').slice(0, 50)
											.map(relative => new FileItem(vscode.Uri.file(cwd), vscode.Uri.file(path.join(cwd, relative))))
									);
								}
                
								if (err && !(<any>err).killed && (<any>err).code !== 1 && err.message) {
									input.items = input.items.concat([
										new MessageItem(vscode.Uri.file(cwd), err.message)
									]);
								}
                
								rgs.splice(i, 1);
                
								if (!rgs.length) {
									input.busy = false;
								}
							}
						});
            
						return rg;
					});
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
