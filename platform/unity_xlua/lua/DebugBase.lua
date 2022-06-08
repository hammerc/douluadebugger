local extends = DebugRequire("DebugExtends")
local handler = extends.handler
local class = extends.class
local yield = coroutine.yield
local resume = debugResume
local DebugClient = DebugRequire("DebugClient")
local DebugServer = DebugRequire("DebugServer")
local DebugDefine = DebugRequire("DebugDefine")
local DebugUtil = DebugRequire("DebugUtil")

---@class DebugBase Lua 调试器基类
---@field _breakPoints table<string, table<number, BreakInfo>> 文件名（无目录和扩展），断点行数，当前行的断点信息
---@field _breakLines table<number, boolean> 记录所有断点的行数的表，便于快速查询
---@field _isInRun boolean lua 是否在运行中，如果为 false 则表示在断点中
---@author wizardc
local DebugBase = class("DebugBase")

function DebugBase:ctor()
    self._breakPoints = {}
    self._breakLines = {}
    self._hookCallCount = 0
    self._lastReceiveTime = 0
    self:resetRun()
end

---@public
---设置 IP
function DebugBase:setHost(host)
    self._host = host
end

---@public
---获取 IP
function DebugBase:getHost()
    return self._host
end

---@public
---设置端口
function DebugBase:setPort(port)
    self._port = port
end

---@public
---获取端口
function DebugBase:getPort()
    return self._port
end

---@public
---获取调试数据
---@return S2C_InitializeArgs
function DebugBase:getDebugData()
    return self._initData
end

---@public
---获得调试 socket
---@return DebugClient
function DebugBase:getDebugSocket()
    return self._debugSocket
end

---@public
---获得辅助 socket
---@return DebugClient
function DebugBase:getSupportSocket()
    return self._supportSocket
end

---@public
---获取当前堆栈数据
---@return StackInfo[]
function DebugBase:getCurrentStackInfo()
    return self._currentStackInfo
end

---@public
---是否正在命中断点
function DebugBase:isInHitPoint()
    return self._currentFrameId and true or false
end

---@public
---获取变量域
---@return ScopeInfo
function DebugBase:getScopeInfo(frameId)
    return self._scopeInfo[frameId or self._currentFrameId]
end

---@public
---获取当前堆栈 ID
function DebugBase:getCurrentFrameId()
    return self._currentFrameId
end

---@public
---获取断点数据
---@return table<string,BreakInfo>
function DebugBase:getBreakPoints()
    return self._breakPoints
end

---@public
---获取钩子函数
---@return fun(event:string, line:number)
function DebugBase:getHookFunc()
    return self._hookFunc
end

---@public
---开始调试
---@param host string 调试器 IP 地址
---@param port number 调试器端口
function DebugBase:startDebug(host, port)
    host = host or self._host
    port = port or self._port

    if not host or (host and type(host) ~= "string") then
        error("host is error")
    end

    if not port or (port and type(port) ~= "number") then
        error("port is error")
    end

    self._host = host
    self._port = port

    self:closeAttachServer()

    debugPrint(string.format("Try to connect the debugger(%s:%d)", host, port))

    --辅助 socket
    self._supportSocket = DebugClient.new()
    local server = self._supportSocket:connect(host, port)
    if server then
        --调试 socket
        self._debugSocket = DebugClient.new()
        self._debugSocket:connect(host, port)

        debugPrint("Launch debugger in " .. _VERSION .. (jit and " " .. jit.version or ""))

        --辅助 socket 阻塞等待数据返回
        self._supportSocket:setTimeout(3000)
        self:doReceiveSupportSocket()

        return true
    else
        --连接失败时启动 Attach 服务器
        self._supportSocket = nil
        self:startAttachServer()
        return false
    end
end

---@private
---接收辅助网络消息，在 hook 函数中会间隔一定时间调用一下
function DebugBase:doReceiveSupportSocket()
    if self._supportSocket then
        local msg = self._supportSocket:receive()
        if msg then
            if msg == "closed" then
                --停止
                self:stopDebug()
            else
                ---@type DebugDefine
                local cmd = msg.command
                if cmd == DebugDefine.stop then
                    --停止
                    self:stopDebug()
                elseif cmd == DebugDefine.initialize then
                    --初始化
                    self:initDebug(msg.args)
                elseif cmd == DebugDefine.setBreakpoints then
                    --断点信息
                    ---@type S2C_SetBreakpointsArgs
                    self:setBreakInfo(msg.args)
                    --这里是为了避免断点信息优先于初始化信息到达时处理，
                    --接收到断点信息时继续进入阻塞状态，直到接收到初始化信息
                    self:doReceiveSupportSocket()
                elseif cmd == DebugDefine.reloadLua then
                    ---@type S2C_ReloadLuaArgs
                    self.reloadData = msg.args
                end
            end
        end

        --重载 lua 文件
        if self.reloadData then
            local data = self.reloadData
            self.reloadData = nil
            DebugUtil.reloadLua(data)
        end
    end
end

---@private
---设置断点信息
---@param data S2C_SetBreakpointsArgs
function DebugBase:setBreakInfo(data)
    for k, v in pairs(data.breakPoints) do
        if #v == 0 then
            self._breakPoints[k] = nil
        else
            local breakDatas = {}
            for _, v2 in ipairs(v) do
                breakDatas[v2.line] = v2
            end
            self._breakPoints[k] = breakDatas
        end
    end

    self._breakLines = {}
    for _, breakInfo in pairs(self._breakPoints) do
        for k, _ in pairs(breakInfo) do
            self._breakLines[k] = true
        end
    end
end

---@private
---初始化事件
---@param data S2C_InitializeArgs
function DebugBase:initDebug(data)
    if self._initData then
        return
    end

    self._initData = data
    --取消辅助 socket 的阻塞
    self._supportSocket:setTimeout(0)

    self:initDebugLoop()
end

---@private
---初始化调试主循环
function DebugBase:initDebugLoop()
    self._loopCoroutine = coroutine.create(handler(self, self.debuggerOnLoop))
    resume(self._loopCoroutine)
    self:initDebugHook()
end

---@protected
---设置调试hook
function DebugBase:initDebugHook()
    self._hookFunc = handler(self, self.debugHook)
    debug.sethook(self._hookFunc, "lrc")
end

---@private
---重置调试变量
function DebugBase:resetDebugInfo()
    self._isInRun = false
    self._isStepNext = false
    self._isStepIn = false
    self._isStepOut = false
    self._currentFrameId = nil
    self._scopeInfo = {}
end

---@public
---重置运行
function DebugBase:resetRun()
    self:resetDebugInfo()
    self._isInRun = true
    self._currentStackInfo = nil
end

---@private
---调试主循环
function DebugBase:debuggerOnLoop()
    while true do
        if self._debugSocket then
            local msg = self._debugSocket:receive()
            if msg then
                if msg == "closed" then
                    self:stopDebug()
                else
                    ---@type DebugDefine
                    local cmd = msg.command
                    if cmd == DebugDefine.stop then
                        --停止
                        self:stopDebug()
                    elseif cmd == DebugDefine.initialize then
                        --初始化
                        self:onInitialize()
                    elseif cmd == DebugDefine.continue then
                        --继续
                        self:onContinue()
                    elseif cmd == DebugDefine.next then
                        --单步跳过
                        self:onStepNext()
                    elseif cmd == DebugDefine.stepIn then
                        --单步跳入
                        self:onStepIn()
                    elseif cmd == DebugDefine.stepOut then
                        --单步跳出
                        self:onStepOut()
                    elseif cmd == DebugDefine.setBreakpoints then
                        --断点信息
                        ---@type S2C_SetBreakpointsArgs
                        local args = msg.args
                        self:setBreakInfo(args)
                    elseif cmd == DebugDefine.getScopes then
                        --获取变量域
                        DebugUtil.xpcall(
                            function()
                                if not self._currentStackInfo then
                                    return
                                end

                                ---@type S2C_getScopes
                                local args = msg.args
                                self._currentFrameId = args.frameId

                                local scopeInfo = DebugUtil.loadScopes()
                                self._scopeInfo[args.frameId] = scopeInfo
                                self._debugSocket:sendScopes(args.frameId, scopeInfo)
                            end
                        )
                    elseif cmd == DebugDefine.getVariable then
                        --获取变量
                        DebugUtil.xpcall(
                            function()

                                ---@type S2C_getVariable
                                local args = msg.args
                                self._currentFrameId = args.frameId
                                local vars, tbkey, realPath = DebugUtil.getVariable(args.path)

                                self._debugSocket:sendVariable(args.path, args.frameId, vars, tbkey, realPath)
                            end
                        )
                    elseif cmd == DebugDefine.watchVariable then
                        --监视变量
                        DebugUtil.xpcall(
                            function()
                                ---@type S2C_watchVariable
                                local args = msg.args
                                self._currentFrameId = args.frameId

                                local ret = DebugUtil.watchVariable(args.exp)

                                --缓存监视变量
                                self._currentStackInfo[args.frameId + 1].vars.watch[args.exp] = ret

                                local data
                                local type = type(ret)
                                if type == "table" then
                                    data = { type = "table", var = {} }
                                    for k, v in pairs(ret) do
                                        data.var[tostring(k)] = DebugUtil.createVariable(v)
                                    end
                                elseif type == "userdata" then
                                    data = { type = "table", var = DebugUtil.ParseCSharpValue(ret) }
                                else
                                    data = DebugUtil.createVariable(ret)
                                end

                                self._debugSocket:sendWatch(args.exp, args.frameId, data, DebugUtil.getTbKey(ret), "watch-" .. args.exp)
                            end
                        )
                    end
                end
            end
        else
            yield()
            break
        end
    end
end

---@protected
---初始化
function DebugBase:onInitialize()
    self:resetRun()
    local stack = yield()
    self._debugSocket:pause(stack)
end

---@protected
---继续
function DebugBase:onContinue()
    self:resetRun()
    local stack = yield()
    self._debugSocket:pause(stack)
end

---@protected
---单步跳过
function DebugBase:onStepNext()
    self:resetDebugInfo()
    self._isStepNext = true
    local stack = yield()
    self._debugSocket:pause(stack)
end

---@protected
---单步跳入
function DebugBase:onStepIn()
    self:resetDebugInfo()
    self._isStepIn = true
    local stack = yield()
    self._debugSocket:pause(stack)
end

---@protected
---单步跳出
function DebugBase:onStepOut()
    self:resetDebugInfo()
    self._isStepOut = true
    local stack = yield()
    self._debugSocket:pause(stack)
end

---@protected
---hook函数
function DebugBase:debugHook(event, line)
    debugPrintErr("Error, The function needs to override")
end

---@public
---命中断点
function DebugBase:hitBreakPoint(level)
    if not self._initData then
        return
    end

    --正在断点中，跳过断点
    if self:isInHitPoint() then
        return
    end

    --获取堆栈信息，跳过前 4 个堆栈
    level = level or 4
    local stackInfo = DebugUtil.getStackInfo(level, true)

    self:hitBreakPointWithStackInfo(stackInfo)
end

---@protected
---命中断点
function DebugBase:hitBreakPointWithStackInfo(stackInfo)
    self._currentStackInfo = stackInfo

    --收集堆栈信息
    local stacks = {}
    for _, v in ipairs(stackInfo) do
        local stack = {
            fileName = v.fileName,
            filePath = v.filePath,
            currentline = v.currentline,
            functionName = v.functionName or tostring(v.func)
        }
        table.insert(stacks, stack)
    end

    resume(self._loopCoroutine, stacks)
end

---@public
---停止调试
function DebugBase:stopDebug()
    debugPrint("StopDebug")

    if self._supportSocket then
        self._supportSocket:close()
        self._supportSocket = nil
        self._debugSocket:close()
        self._debugSocket = nil

        self._initData = nil
        self._breakPoints = {}
        self:resetRun()
    end

    --停止调试时启动 Attach 服务器
    self:startAttachServer()
end

---@public
---启动附加服务器
function DebugBase:startAttachServer()
    if not self._port then
        return
    end
    DebugUtil.xpcall(function()
        if not self._attachServer then
            --附加服务器
            self._attachServer = DebugServer.new()
            self._attachServer:createServer(self._port + 1)

            --在 unity 编辑器模式下，附加服务器端口会绑定在 unity 编辑器上
            --结束游戏运行时并不会销毁该端口，导致再次运行客户端并启动附加服务器时会因端口被占用而启动失败
            --故需要在游戏退出时，自行调用销毁端口函数
            if DebugUtil.isLoadedLuaDebugUtil() then
                CS.LuaDebugUtil.Init(
                    function()
                        debugPrintErr("Game quit, close server socket")
                        self:closeAttachServer()
                    end
                )
            end

            self:initAttachServerHook()
        end
    end)
end

---@private
---设置附加服务器 hook
function DebugBase:initAttachServerHook()
    self._hookFunc = handler(self, self.tryAcceptAttachServer)
    debug.sethook(self._hookFunc, "lrc")
end

---@private
---尝试接收连接到附加服务的 SocketClient
function DebugBase:tryAcceptAttachServer(event, line)
    if event == "call" then
        if self._hookCallCount >= 100 then
            self._hookCallCount = 0
            local time = os.clock()
            if time - self._lastReceiveTime > 0.1 then
                self._lastReceiveTime = time
                self:doReceiveAttachSocket()
            end
        else
            self._hookCallCount = self._hookCallCount + 1
        end
    end
end

---@private
---接收附加调试网络消息
function DebugBase:doReceiveAttachSocket()
    if self._attachServer then
        if self._attachServer:accept() then
            local msg = self._attachServer:receive()
            if msg then
                local cmd = msg.command

                if cmd == DebugDefine.startDebug then
                    ---@type S2C_StartDebug
                    local args = msg.args
                    self:startDebug(args.host, args.port)

                    return true
                end
            end
        end
    end
end

---@public
---关闭附加服务器
function DebugBase:closeAttachServer()
    if self._attachServer then
        self._attachServer:close()
        self._attachServer = nil
    end
end

return DebugBase
