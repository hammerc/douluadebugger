import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as vscode from "vscode";
import { LuaWorkspace } from "../core/LuaWorkspace";

/**
 * 工具类
 * @author wizardc
 */
export class LuaUtil {
    /**
     * 递归读取目录下的所有文件
     */
    public static readDir(dirPath: string, dirs: string[] = [], curDir: string = ""): string[] {
        dirPath = dirPath.replace(new RegExp("\\\\", "gm"), "/");
        let lastChar = dirPath.substring(dirPath.length - 1);
        if (lastChar !== "/") {
            dirPath = dirPath + "/";
        }
        let realPath = dirPath + curDir;
        let isRecursion = !!dirs;
        dirs = dirs || [];
        let files = fs.readdirSync(realPath);
        files.forEach((item, index) => {
            let stat = fs.statSync(realPath + item);
            if (stat.isDirectory() && isRecursion) {
                this.readDir(dirPath, dirs, curDir + item + "/");
            } else {
                dirs.push(curDir + item);
            }
        });
        return dirs;
    }

    /**
     * 创建空文件
     */
    public static tryCreateFile(filePath: string, defaultContent: string = ""): void {
        if (fs.existsSync(filePath)) {
            return;
        }
        let dirPath = path.dirname(filePath);
        try {
            fs.statSync(dirPath);
        } catch (error) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, defaultContent);
    }

    /**
     * 读文件
     */
    public static readFile(filePath: string): string {
        let data = fs.readFileSync(filePath, "utf-8");
        return data;
    }

    /**
     * 写文件
     */
    public static writeFile(filePath: string, content: string): void {
        fs.writeFileSync(filePath, content);
    }

    /**
     * 拷贝目录
     */
    public static copyDir(from: string, to: string): void {
        let fromPath = path.resolve(from);
        let toPath = path.resolve(to);
        try {
            fs.statSync(toPath);
        } catch (error) {
            fs.mkdirSync(toPath);
        }
        fs.readdir(fromPath, (err, paths) => {
            if (err) {
                console.log(err);
                return;
            }
            paths.forEach((item) => {
                let newFromPath = fromPath + "/" + item;
                let newToPath = path.resolve(toPath + "/" + item);
                fs.stat(newFromPath, (err, stat) => {
                    if (err) {
                        return;
                    }
                    if (stat.isFile()) {
                        fs.copyFileSync(newFromPath, newToPath);
                    }
                    if (stat.isDirectory()) {
                        this.copyDir(newFromPath, newToPath);
                    }
                });
            });
        });
    }

    /**
     * 复制文件或目录
     */
    public static copy(from: string, to: string): void {
        let fromPath = path.resolve(from);
        let toPath = path.resolve(to);
        let dir = this.getDirPath(toPath);
        try {
            fs.statSync(dir);
        } catch (error) {
            fs.mkdirSync(dir);
        }
        fs.stat(fromPath, (err, stat) => {
            if (err) {
                return;
            }
            if (stat.isFile()) {
                fs.copyFileSync(fromPath, toPath);
            }
            if (stat.isDirectory()) {
                this.copyDir(fromPath, toPath);
            }
        });
    }

    /**
     * 获取文件名
     */
    public static getFileName(filePath: string, isIgnoreSuffix: boolean = false): string {
        filePath = this.getFormatPath(filePath);
        let idx = filePath.lastIndexOf("/") + 1;
        let fileName = filePath.substring(idx, filePath.length);
        if (isIgnoreSuffix) {
            let idx = fileName.indexOf(".");
            if (idx !== -1) {
                fileName = fileName.substring(0, idx);
            }
        }
        return fileName;
    }

    /**
     * 统一路径分隔符为 "/"
     */
    public static getFormatPath(path: string): string {
        return path.replace(/\\\\/g, "/").replace(/\\/g, "/");
    }

    /**
     * 路径解析成 require("") 使用的 lua 路径
     */
    public static parseToLuaPath(fsPath: string): string | undefined {
        let luaRoot = LuaWorkspace.instance.getLuaRoot();
        let finalLuaRoot;
        if (!luaRoot) {
            vscode.window.showWarningMessage("请配置Lua项目根目录");
            return undefined;
        } else {
            luaRoot = path.normalize(luaRoot);
            if (luaRoot.slice(luaRoot.length - 1, luaRoot.length) !== "\\") {
                luaRoot = luaRoot + "\\";
            }
            finalLuaRoot = luaRoot.toLowerCase();
        }
        let len = luaRoot.length;
        let lowerPath = fsPath.toLowerCase();
        let ret = undefined;
        if (lowerPath.indexOf(finalLuaRoot) !== -1) {
            ret = fsPath.slice(len, fsPath.length);
            ret = ret.slice(0, ret.indexOf(".")).replace(/\\/g, ".");
        } else {
            vscode.window.showWarningMessage("该文件不在Lua项目目录中");
            return undefined;
        }
        return ret;
    }

    /**
     * 获取日期
     */
    public static formatDate(): string {
        let datetime = new Date();
        let year = datetime.getFullYear(),
            month = ("0" + (datetime.getMonth() + 1)).slice(-2),
            date = ("0" + datetime.getDate()).slice(-2),
            hour = ("0" + datetime.getHours()).slice(-2),
            minute = ("0" + datetime.getMinutes()).slice(-2),
            second = ("0" + datetime.getSeconds()).slice(-2);
        let result = year + "-" + month + "-" + date + " " + hour + ":" + minute + ":" + second;
        return result;
    }

    /**
     * 打开文件或路径
     */
    public static openFileInFinder(filePath: string): void {
        filePath = filePath.replace(new RegExp("\\\\", "gm"), "/");
        if (!fs.existsSync(filePath)) {
            console.log("文件不存在：" + filePath);
        }
        if (fs.statSync(filePath).isDirectory()) {
            child_process.exec(`start ${filePath}`);
        } else {
            filePath = path.dirname(filePath);
            child_process.exec(`start ${filePath}`);
        }
    }

    /**
     * 在 VSCode 中打开某文件
     */
    public static openFileInVscode(path: string): void {
        vscode.window.showTextDocument(vscode.Uri.file(path));
    }

    /**
     * 获取文件夹路径
     */
    public static getDirPath(fsPath: string): string {
        fsPath = this.getFormatPath(fsPath);
        let dir = undefined;
        try {
            if (fs.statSync(fsPath).isDirectory()) {
                dir = fsPath;
            } else {
                const idx = fsPath.lastIndexOf("/");
                dir = fsPath.substring(0, idx);
            }
        } catch (error) {
            const idx = fsPath.lastIndexOf("/");
            dir = fsPath.substring(0, idx);
        }
        return dir;
    }

    /**
     * 打开导入调试文件弹窗
     */
    public static showOpenDialog(msg: string, func: (retPath: string | undefined) => void): void {
        let defaultPath = LuaWorkspace.instance.getLuaRoot();
        let option: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: msg
        };
        if (defaultPath) {
            option.defaultUri = vscode.Uri.file(defaultPath);
        }
        vscode.window.showOpenDialog(option).then((uris: vscode.Uri[] | undefined) => {
            if (uris) {
                func(uris[0].fsPath);
            } else {
                func(undefined);
            }
        });
    }
}
