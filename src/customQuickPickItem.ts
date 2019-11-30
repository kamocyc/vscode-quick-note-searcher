import * as path from 'path';
import * as vscode from 'vscode';

class FileItem implements vscode.QuickPickItem {

	public label: string;
	public description: string;
	
	constructor(public base: vscode.Uri, public uri: vscode.Uri) {
		this.label = path.basename(uri.fsPath);
		this.description = path.dirname(path.relative(base.fsPath, uri.fsPath));
	}
} 

class MessageItem implements vscode.QuickPickItem {

	public label: string;
	public description = '';
	public detail: string;
	
	constructor(public base: vscode.Uri, public message: string) {
		this.label = message.replace(/\r?\n/g, ' ');
		this.detail = base.fsPath;
	} 
}

export { FileItem, MessageItem };
