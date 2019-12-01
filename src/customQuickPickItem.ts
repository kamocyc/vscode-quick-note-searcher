import * as path from 'path';
import * as vscode from 'vscode';

export class FileItem implements vscode.QuickPickItem {
	public label: string;
	public description: string;
  public filePath: string;
  public fileName: string;
  public base: string;
  public uri: vscode.Uri;
  public orIndex: number;
	
	constructor(base: string, uri: vscode.Uri, description: string, orIndex: number) {
    this.base = base;
    this.uri = uri;
		this.label = path.basename(uri.fsPath);
    this.fileName = this.label;
    this.filePath = path.dirname(path.relative(base, uri.fsPath));
    this.description = description;
    this.orIndex = orIndex;
	}
}

export class MessageItem implements vscode.QuickPickItem {
	public label: string;
	public description = '';
	public detail: string;
	
	constructor(public base: string, public message: string) {
		this.label = message.replace(/\r?\n/g, ' ');
		this.detail = base;
	} 
}

export type SearcherItem = FileItem | MessageItem;
