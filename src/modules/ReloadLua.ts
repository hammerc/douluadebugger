import * as vscode from "vscode";
import { LuaUtil } from "../utils/LuaUtil";
import { LuaDebugProvider } from "../debugger/provider/LuaDebugProvider";

function reloadLua(uri: vscode.Uri): void {
    if (uri && uri.fsPath) {
        let luaPath = LuaUtil.parseToLuaPath(uri.fsPath);
        if (luaPath) {
            LuaDebugProvider.instance.reloadLua(luaPath, uri.fsPath);
        }
    }
}

export function init(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand("DouLuaDebugger.reloadLua", (uri) => {
        reloadLua(uri);
    }));
}
