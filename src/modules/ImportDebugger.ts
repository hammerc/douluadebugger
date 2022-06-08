import * as vscode from "vscode";
import { LuaUtil } from "../utils/LuaUtil";
import { LuaWorkspace } from "../core/LuaWorkspace";

function importDebuggerFile(path: string | undefined): void {
    if (!path) {
        return;
    }
    let from = LuaWorkspace.instance.getExtensionDir() + "/platform/unity_xlua/";
    let to;
    let idx = path.lastIndexOf("/");
    let lastDir = path.substring(idx + 1, path.length);
    if (lastDir === "Debug") {
        to = path;
    } else {
        to = path + "/Debug";
    }
    LuaUtil.copyDir(from, to);
    LuaUtil.openFileInFinder(to);
}

function showImportDebugFilesOpenDialog(msg: string, func: (retPath: string | undefined) => void): void {
    LuaUtil.showOpenDialog(msg,
        (path: string | undefined) => {
            if (path) {
                let idx = path.lastIndexOf("\\");
                if (idx !== -1) {
                    let lastPath = path.substring(idx + 1, path.length);
                    if (lastPath === "Debug") {
                        path = path.substring(0, idx);
                    }
                }
                func(path);
            } else {
                func(undefined);
            }
        }
    );
}

function importDebugger(uri: vscode.Uri) {
    if (uri && uri.fsPath) {
        let dir = LuaUtil.getDirPath(uri.fsPath);
        importDebuggerFile(dir);
    } else {
        showImportDebugFilesOpenDialog("导入", (path) => {
            if (path) {
                importDebuggerFile(path);
            }
        });
    }
}

export function init(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand("DouLuaDebugger.importDebugger", (uri) => {
        importDebugger(uri);
    }));
}
