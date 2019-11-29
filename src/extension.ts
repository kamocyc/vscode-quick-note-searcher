import * as vscode from "vscode";
import { quickOpen } from "./quickFileSearch";

export function activate(context: vscode.ExtensionContext) {
	console.log('extension is now active!');

  // まず，入力値を受け取って，agコマンドを提携で出す所
	// The command has been defined in the package.json file
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('quick-file-searcher.show-search-box', () => {
    quickOpen()
    .then(s => console.log({ok: s, type: "ok"}))
    .catch(e => console.log({err: e, type: "err"}));
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
