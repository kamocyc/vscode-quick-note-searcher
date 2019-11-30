import * as path from 'path';
import * as vscode from 'vscode';

class FileItem implements vscode.QuickPickItem {

	public label: string;
	public description: string;
  public filePath: string;
  public fileName: string;
  public base: string;
  public uri: vscode.Uri;
	
	constructor(base: string, uri: vscode.Uri, description: string) {
    this.base = base;
    this.uri = uri;
		this.label = path.basename(uri.fsPath);
    this.fileName = this.label;
    this.filePath = path.dirname(path.relative(base, uri.fsPath));
    this.description = description;
	}
} 

class MessageItem implements vscode.QuickPickItem {

	public label: string;
	public description = '';
	public detail: string;
	
	constructor(public base: string, public message: string) {
		this.label = message.replace(/\r?\n/g, ' ');
		this.detail = base;
	} 
}

export { FileItem, MessageItem };
