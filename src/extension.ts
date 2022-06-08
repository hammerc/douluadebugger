import * as vscode from "vscode";
import { LuaWorkspace } from "./core/LuaWorkspace";
import {LuaDebugProvider} from "./debugger/provider/LuaDebugProvider";
import * as ReloadLua from "./modules/ReloadLua";
import * as ImportDebugger from "./modules/ImportDebugger";

export function activate(context: vscode.ExtensionContext) {
    console.log("DouLuaDebugger is actived!");

    LuaWorkspace.instance.init(context);
    LuaDebugProvider.instance.init(context);
    ReloadLua.init(context);
    ImportDebugger.init(context);
}

export function deactivate() {
}
