---@class NetData 网络数据格式
---@field command string
---@field args table

---@class BreakInfo 断点信息
---@field fullPath string
---@field line number
---@field condition string
---@field hitCondition string
---@field logMessage string

---@class ScopeInfo 变量域信息
---@field struct ScopeInfoVariableStruct 变量结构

---@class ScopeInfoVariableStruct 变量域变量结构
---@field locals table 局部变量
---@field ups table 上层变量(闭包时才有)
---@field global table 全局变量
---@field watch table 监视变量
---@field invalid table

---@class StackInfo 堆栈信息
---@field fileName string 文件名
---@field filePath string 文件相对路径
---@field currentline number 当前行
---@field linedefined number 函数开始行
---@field lastlinedefined number 函数结束行
---@field functionName string 函数名
---@field func function 函数
---@field vars ScopeInfoVariableStruct 引用变量

---@class VariableData
---@field type string 变量类型
---@field var string 变量值

---@class S2C_InitializeArgs 初始化
---@field name string
---@field type string
---@field request string
---@field clientHost string 客户端地址
---@field port number 调试器的端口
---@field printType number print打印方式 1 控制台和系统输出,2 控制台输出,3 系统输出
---@field externalVariables string[] 附加变量名列表 (如：查看变量时指向子类可直接查看父类数据，或查看元表二次、多次封装的数据)
---@field filterFiles string[] 过滤文件列表, 以下文件不会进入断点
---@field __configurationTarget number
---@field __sessionId string

---@class S2C_SetBreakpointsArgs 设置断点参数
---@field breakPoints BreakInfo[]

---@class C2S_PrintConsoleArgs 打印消息到控制台
---@field msg string
---@field type number 1正常 2警告 3错误

---@class S2C_getScopes 获取变量域
---@field frameId number 堆栈索引

---@class S2C_getVariable 获取变量
---@field path string 变量 table 路径
---@field frameId number 堆栈索引

---@class S2C_watchVariable 监视变量
---@field exp string 表达式 lua 语法
---@field frameId number 堆栈索引

---@class S2C_ReloadLuaArgs 重载 lua 文件
---@field luaPath string lua 路径
---@field fullPath string 绝对路径

---@class C2S_ShowDialogMessage 显示窗口信息
---@field msg string

---@class CSharp_ValueInfo C# 值信息
---@field key string
---@field value any
---@field valueStr string
---@field valueType string
---@field tbkey string

---@class S2C_StartDebug 设置 host
---@field host string
---@field port number

---@class DebugDefine 调试器定义
return {
    ---初始化
    ---@field args S2C_InitializeArgs
    initialize = "initialize",
    ---设置断点
    ---@field args S2C_SetBreakpointsArgs
    setBreakpoints = "setBreakpoints",
    ---暂停
    pause = "pause",
    ---继续
    continue = "continue",
    ---单步跳过
    next = "next",
    ---单步跳入
    stepIn = "stepIn",
    ---单步跳出
    stepOut = "stepOut",
    ---停止
    stop = "stop",
    ---获取变量域
    ---@field args S2C_getScopes
    getScopes = "getScopes",
    ---获取变量
    getVariable = "getVariable",
    ---监视变量
    watchVariable = "watchVariable",
    ---打印到控制台
    ---@field args C2S_PrintConsoleArgs
    printConsole = "printConsole",
    ---重载lua文件
    ---@field args S2C_ReloadLuaArgs
    reloadLua = "reloadLua",
    ---显示窗口信息
    ---@field args C2S_ShowDialogMessage
    showDialogMessage = "showDialogMessage",
    ---重置堆栈信息
    resetStackInfo = "resetStackInfo",
    ---开始调试
    startDebug = "startDebug"
}
