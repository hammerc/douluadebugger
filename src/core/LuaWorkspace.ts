import * as vscode from "vscode";
import { LuaUtil } from "../utils/LuaUtil";
import { ConfigName, EXTENSION_NAME, LOCAL_DATA_FILE } from "./LuaDefine";

/**
 * Lua 项目工作空间管理类
 * @author wizardc
 */
export class LuaWorkspace {
    private static _instance: LuaWorkspace;

    public static get instance(): LuaWorkspace {
        if (!this._instance) {
            this._instance = new LuaWorkspace();
        }
        return this._instance;
    }

    // 全局配置
    private _globalConfig: vscode.WorkspaceConfiguration | undefined;
    // 工作区配置
    private _workSpaceConfig: vscode.WorkspaceConfiguration | undefined;
    // 文件列表，k：文件完整路径，v：文件 uri
    private _files: Map<string, vscode.Uri>;
    // 相对文件路径列表，k：文件名，v：同名文件的所有完整路径
    private _relativeFilePaths: Map<string, string[]>;
    // lua根节点 右单斜线路径
    private _luaRoot: string | undefined;
    // lua根节点名
    private _luaRootName: string | undefined;
    // 本扩展上下文
    private _context: vscode.ExtensionContext | undefined;

    private constructor() {
        this._files = new Map<string, vscode.Uri>();
        this._relativeFilePaths = new Map<string, string[]>();
    }

    public init(context: vscode.ExtensionContext): void {
        this._context = context;

        // 工作区改变
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this._workSpaceConfig = undefined;
            this._luaRoot = undefined;
            this.initFileList();
        });

        // 新建文件
        vscode.workspace.onDidCreateFiles((e: vscode.FileCreateEvent) => {
            e.files.forEach(uri => {
                this.addFileCache(uri);
            });
        });

        // 删除文件
        vscode.workspace.onDidDeleteFiles((e: vscode.FileDeleteEvent) => {
            e.files.forEach(uri => {
                this.removeFileCache(uri.fsPath);
            });
        });

        // 重命名文件
        vscode.workspace.onDidRenameFiles((e: vscode.FileRenameEvent) => {
            e.files.forEach(elm => {
                this.removeFileCache(elm.oldUri.fsPath);
                this.addFileCache(elm.newUri);
            });
        });

        // 配置变化
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            this._globalConfig = undefined;
            this._workSpaceConfig = undefined;
        });
    }

    /**
     * 添加文件缓存
     */
    private addFileCache(uri: vscode.Uri): void {
        let fsPath = LuaUtil.getFormatPath(uri.fsPath);
        this._files.set(fsPath, uri);

        let fileName = LuaUtil.getFileName(fsPath);
        let list = this._relativeFilePaths.get(fileName);
        if (!list) {
            list = [];
            this._relativeFilePaths.set(fileName, list);
        }
        list.push(fsPath);

        let luaRoot = this.getLuaRoot();
        if (luaRoot) {
            let relativePath = fsPath.replace(luaRoot, "");
            let list = this._relativeFilePaths.get(relativePath);
            if (!list) {
                list = [];
                this._relativeFilePaths.set(relativePath, list);
            }
            list.push(fsPath);

            let rootName = this.getLuaRootName();
            if (rootName) {
                let rootRelativePath = rootName + "/" + relativePath;
                let list = this._relativeFilePaths.get(rootRelativePath);
                if (!list) {
                    list = [];
                    this._relativeFilePaths.set(rootRelativePath, list);
                }
                list.push(fsPath);
            }
        }
    }

    /**
     * 删除文件缓存
     */
    private removeFileCache(fsPath: string) {
        fsPath = LuaUtil.getFormatPath(fsPath);
        if (this._files.has(fsPath)) {
            this._files.delete(fsPath);
        }

        let fileName = LuaUtil.getFileName(fsPath);
        let list = this._relativeFilePaths.get(fileName);
        if (list) {
            let idx = 0;
            while (idx < list.length) {
                if (list[idx] === fsPath) {
                    list.splice(idx, 1);
                    break;
                } else {
                    idx++;
                }
            }
        }

        let luaRoot = this.getLuaRoot();
        if (luaRoot) {
            let relativePath = fsPath.replace(luaRoot, "");
            let list = this._relativeFilePaths.get(relativePath);
            if (list) {
                let idx = 0;
                while (idx < list.length) {
                    if (list[idx] === fsPath) {
                        list.splice(idx, 1);
                        break;
                    } else {
                        idx++;
                    }
                }
            }
        }
    }

    /**
     * 获取本插件实例
     */
    public getExtension(): vscode.Extension<any> | undefined {
        return this._context?.extension;
    }

    /**
     * 获取本插件目录
     */
    public getExtensionDir(): string | undefined {
        return this.getExtension()?.extensionPath;
    }

    /**
     * 获取用户配置
     */
    public getGlobalConfig(): vscode.WorkspaceConfiguration {
        if (!this._globalConfig) {
            this._globalConfig = vscode.workspace.getConfiguration(EXTENSION_NAME);
        }
        return this._globalConfig;
    }

    /**
     * 获取工作区配置
     */
    public getWorkspaceConfig(): vscode.WorkspaceConfiguration {
        if (this._workSpaceConfig) {
            return this._workSpaceConfig;
        }
        // 只获取第一个工作空间的配置
        let wf = vscode.workspace.workspaceFile;
        if (!wf) {
            let folders = vscode.workspace.workspaceFolders;
            if (folders) {
                wf = folders[0].uri;
            }
        }
        let cfg = vscode.workspace.getConfiguration(EXTENSION_NAME, wf);
        this._workSpaceConfig = cfg;
        return cfg;
    }

    /**
     * 获取插件 lua 调试器路径
     */
    public getExtensionLuaDebugPath(): string {
        return this.getExtensionDir() + "/other/lua/";
    }

    /**
     * 获取插件 unity 调试器路径
     */
    public getExtensionUnityDebugPath(): string {
        return this.getExtensionDir() + "/other/cs/";
    }

    /**
     * 获取 lua 根目录
     */
    public getLuaRoot(): string | undefined {
        if (!!this._luaRoot) {
            return this._luaRoot;
        }

        let luaRoot = this.getWorkspaceConfig().get<string>(ConfigName.LUA_ROOT);
        if (luaRoot) {
            // 替换工作根目录
            if (luaRoot.indexOf("${workspaceRoot}") !== -1) {
                const workspaceFolders = vscode.workspace.workspaceFolders || [];
                luaRoot = luaRoot.replace("${workspaceRoot}", workspaceFolders[0].uri.fsPath);
            }
            // 格式化路径
            let lastChar = luaRoot.substring(luaRoot.length - 1, luaRoot.length);
            if (lastChar !== "/" && lastChar !== "\\") {
                luaRoot = luaRoot + "/";
            }
            luaRoot = LuaUtil.getFormatPath(luaRoot);
        }

        this._luaRoot = luaRoot;
        return luaRoot;
    }

    /**
     * 获取 lua 根目录名
     */
    public getLuaRootName(): string | undefined {
        if (!!this._luaRootName) {
            return this._luaRootName;
        }

        let luaRoot = this.getLuaRoot();
        if (luaRoot) {
            let idx1 = luaRoot.length - 1;
            let idx2 = luaRoot.lastIndexOf("/", idx1 - 1);
            if (idx2 != -1) {
                idx2++;
                this._luaRootName = luaRoot.substring(idx2, idx1);
            }
        }

        return this._luaRootName;
    }

    /**
     * 清除文件缓存
     */
    private clearFileCache(): void {
        this._files.clear();
        this._relativeFilePaths.clear();
    }

    /**
     * 初始化文件列表
     */
    public initFileList(func?: Function): void {
        this.clearFileCache();

        vscode.workspace.findFiles("**/*.lua", undefined).then((uris: vscode.Uri[]) => {
            uris.forEach(uri => {
                this.addFileCache(uri);
            });
            if (func) {
                func();
            }
        });
    }

    /**
     * 获取文件绝对路径，同名文件只返回第一个路径
     */
    public getFileFullPath(path: string): string | string[] | undefined {
        if (this._files.has(path)) {
            return path;
        }
        let list = this._relativeFilePaths.get(path);
        if (list?.length === 1) {
            return list[0];
        }
        return list;
    }
}
