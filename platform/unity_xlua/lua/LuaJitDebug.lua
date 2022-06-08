local extends = DebugRequire("DebugExtends")
local class = extends.class
local DebugBase = DebugRequire("DebugBase")
local DebugUtil = DebugRequire("DebugUtil")
local yield = coroutine.yield

---@class LuaJitDebug:DebugBase Lua Jit 调试器
local LuaJitDebug = class("LuaJitDebug", DebugBase)

function LuaJitDebug:ctor()
    self.super.ctor(self)
    self._continueStackInfo = nil
end

function LuaJitDebug:resetDebugInfo()
    self.super.resetDebugInfo(self)
    self._stepNextTime = 0
end

function LuaJitDebug:resetRun()
    self.super.resetRun(self)
    self._isForceHitNextLine = false
end

function LuaJitDebug:onInitialize()
    self:resetRun()
    local stack = yield()

    local stackInfo = self._currentStackInfo[1]
    if stackInfo and stackInfo.lastlinedefined ~= stackInfo.currentline then
        self._continueStackInfo = self._currentStackInfo
    end

    self._debugSocket:pause(stack)
end

function LuaJitDebug:onContinue()
    self:resetRun()
    local stack = yield()

    local stackInfo = self._currentStackInfo[1]
    if stackInfo and stackInfo.lastlinedefined ~= stackInfo.currentline then
        self._continueStackInfo = self._currentStackInfo
    end

    self._debugSocket:pause(stack)
end

function LuaJitDebug:debugHook(event, line)
    if not self._supportSocket then
        self:initAttachServerHook()
        return
    end

    --间隔指定时间接收辅助网络消息
    if event == "call" then
        if self._hookCallCount >= 100 then
            self._hookCallCount = 0
            local time = os.clock()
            if time - self._lastReceiveTime > 0.1 then
                self._lastReceiveTime = time
                self:doReceiveSupportSocket()
            end
        else
            self._hookCallCount = self._hookCallCount + 1
        end
    end

    if self._continueStackInfo then
        local info = debug.getinfo(2)
        if info.source == "=[C]" or info.source == "[C]" then
            return
        end

        local stackInfo = self._continueStackInfo[1]

        if stackInfo and stackInfo.func == info.func then
            if stackInfo.currentline == info.currentline then
                return
            else
                self._continueStackInfo = nil
            end
        end
    end

    if event == "line" then
        --没有对这一行进行断点则退出
        if self._isInRun and not self._breakLines[line] then
            return
        end

        local info = debug.getinfo(2)
        if info.source == "=[C]" or info.source == "[C]" then
            return
        end

        local filePath, fileName, surfix = DebugUtil.getFilePathInfo(info.source)

        --需要过滤掉不进断点的文件
        if self._initData and self._initData.filterFiles then
            for _, v in pairs(self._initData.filterFiles) do
                if DebugUtil.comparePath(filePath, v) then
                    return
                end
            end
        end

        --正在断点中的处理
        if self._currentStackInfo then
            local stackInfo = self._currentStackInfo[1]

            if info.func == stackInfo.func and info.currentline == stackInfo.currentline then
                return
            end

            if self._isStepIn then --单步跳入，进入下一行时直接进断点
                self:hitBreakPoint()
                return
            end

            if self._isStepNext then --单步跳过
                local isNext = self._isForceHitNextLine

                if not isNext then
                    --查询当前堆栈函数
                    for _, v in ipairs(self._currentStackInfo) do
                        if (v.func == info.func) then
                            if (v.currentline == line) then
                                return
                            end

                            isNext = true
                            break
                        end
                    end
                else
                    self._isForceHitNextLine = false
                end

                if isNext then
                    local stackInfo = DebugUtil.getStackInfo(3, false)
                    if info.lastlinedefined == info.currentline and #stackInfo == 1 then
                        --函数 return，下一步强制进入断点
                        self._isForceHitNextLine = true
                    end

                    self:hitBreakPoint()
                    return
                else
                    --单步跳过时内部函数执行行数超过阈值跳过本次操作
                    self._stepNextTime = self._stepNextTime + 1
                    if self._stepNextTime >= 2000000 then
                        printWarn("本函数执行代码过多, 跳过操作")
                        self._supportSocket:resetStackInfo()
                        self:resetRun()
                    end
                end
            end
        end

        --判断是否命中断点
        local breakPoints = self._breakPoints[fileName]
        if breakPoints then
            for _, v in pairs(breakPoints) do
                if v.line == line then
                    if DebugUtil.comparePath(v.fullPath, filePath) then
                        --日志打印
                        if v.logMessage then
                            --执行脚本后返回执行的结果
                            if v.logMessage:len() >= 3 then
                                if v.logMessage:sub(1, 3) == ">>>" then
                                    DebugUtil.executeScript(
                                        string.format("print(%s)", v.logMessage:sub(4, v.logMessage:len()))
                                    )
                                    return
                                end
                            end
                            --直接打印日志
                            local log = string.gsub(v.logMessage, "\"+", "\\\"")
                            DebugUtil.executeScript(string.format("print(%s)", '"' .. log .. '"'))
                            return
                        end
                        --断点条件判断
                        if not v.condition or (v.condition and DebugUtil.executeScript(v.condition)) then
                            self:hitBreakPoint()
                            return
                        end
                    end
                end
            end
        end
    end
end

function LuaJitDebug:stopDebug()
    if self._supportSocket then
        self._continueStackInfo = nil
    end

    self.super.stopDebug(self)
end

---@type LuaJitDebug
local LuaDebug = LuaJitDebug.new()
xpcall(
    function()
        _G.LuaDebug = LuaDebug
    end,
    function()
        rawset(_G, "LuaDebug", LuaDebug)
    end
)
