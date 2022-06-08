import * as vscode from "vscode";
import { LuaEvent, LuaPrintType } from "../define/LuaDebugDefine";
import { LuaWorkspace } from "../../core/LuaWorkspace";

/**
 * 调试器通信类
 * @author wizardc
 */
export class LuaDebugProvider {
    private static _instance: LuaDebugProvider;

    public static get instance(): LuaDebugProvider {
        if (!this._instance) {
            this._instance = new LuaDebugProvider();
        }
        return this._instance;
    }

    private _session: vscode.DebugSession | undefined;

    private constructor() {
        this._session = undefined;
    }

    public init(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
            this.onDebugCustomEvent(e);
        }));
        context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(e => {
            this.onTerminateDebugSession(e)
        }));
    }

    private onDebugCustomEvent(e: vscode.DebugSessionCustomEvent): void {
        this._session = e.session;
        if (e.event === LuaEvent.getFullPath) {
            var fullPath = LuaWorkspace.instance.getFileFullPath(e.body.filePath);
            if (fullPath) {
                if (fullPath instanceof Array) {
                    fullPath = fullPath[0];
                }
            }
            this._session.customRequest(LuaEvent.getFullPath, { fullPath: fullPath, idx: e.body.idx });
        } else if (e.event === LuaEvent.showDialogMessage) {
            this.showDialog(e.body.type, e.body.msg);
        } else if (e.event === LuaEvent.initDebugEnv) {
            LuaWorkspace.instance.initFileList(
                () => {
                    if (this._session) {
                        this._session.customRequest(LuaEvent.initDebugEnv, { luaRoot: LuaWorkspace.instance.getLuaRoot() });
                    }
                }
            );
        }
    }

    private onTerminateDebugSession(session: vscode.DebugSession): void {
    }

    private showDialog(type: number, msg: string): void {
        if (type === 1) {
            vscode.window.showInformationMessage(msg);
        } else if (type === 2) {
            vscode.window.showWarningMessage(msg);
        } else {
            vscode.window.showErrorMessage(msg);
        }
    }

    public reloadLua(path: string, fullPath: string): void {
        if (this._session) {
            this._session.customRequest(LuaEvent.reloadLua, { luaPath: path, fullPath: fullPath });
        } else {
            vscode.window.showWarningMessage("重载失败，调试器未启动");
        }
    }

    public printConsole(msg: string, type: number = LuaPrintType.normal): void {
        if (this._session) {
            this._session.customRequest(LuaEvent.printConsole, { msg: msg, type: type });
        }
    }
}
