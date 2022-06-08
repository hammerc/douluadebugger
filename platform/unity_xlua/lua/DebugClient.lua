local extends = DebugRequire("DebugExtends")
local class = extends.class
local json = DebugRequire("DebugJson")
local define = DebugRequire("DebugDefine")
local Util = DebugRequire("DebugUtil")
local socket = DebugRequire("socket.core")

---@class DebugClient 调试客户端
---@field _client userdata 客户端连接
local DebugClient = class("DebugClient")

function DebugClient:ctor()
end

---@public
---连接网络
function DebugClient:connect(ip, port)
    local tcp = socket.connect(ip, port)
    if tcp then
        self._client = tcp
        return tcp
    end
end

---@public
---是否已连接
function DebugClient:isConnection()
    return self._client and true or false
end

---@public
---设置超时
function DebugClient:setTimeout(time)
    if not self:isConnection() then
        printErr("The socket is not connected")
        return
    end

    self._client:settimeout(time)
end

---@public
---接收数据
---@return NetData
function DebugClient:receive()
    if self._client then
        local msg, status = self._client:receive()
        if msg then
            return json.decode(msg)
        elseif status == "closed" then
            return "closed"
        end
    end

    return nil
end

---@public
---发送数据
---@param command Protocol
---@param args table
function DebugClient:sendMsg(command, args)
    if not self:isConnection() then
        printErr("The socket is not connected")
        return
    end

    local sendMsg = {
        command = command,
        arguments = args
    }
    xpcall(
        function()
            local sendStr = json.encode(sendMsg) .. "\n"
            self._client:send(sendStr)
        end,
        function(msg)
            print(msg, debug.traceback())
        end
    )
end

---@public
---发送控制台打印消息
---@param msg string
---@param type number 类型 0普通 1警告 2错误
function DebugClient:printConsole(msg, type)
    type = type or 0

    --过长的消息需要拆分
    local msgTb = {}
    while true do
        if msg:len() > 500000 then
            local str = msg:sub(0, 500000)
            local idx = Util.lastFind(str, "\n")
            if not idx then
                idx = 500000
            end

            table.insert(msgTb, msg:sub(0, idx))
            msg = msg:sub(idx, msg:len())
        else
            table.insert(msgTb, msg)
            break
        end
    end

    for _, v in ipairs(msgTb) do
        self:sendMsg(define.printConsole, { msg = v, type = type })
    end
end

---@public
---发送窗口提示消息
---@param msg string
---@param type number 类型 1普通 2警告 3错误
function DebugClient:showDialogMessage(msg, type)
    type = type or 1

    --过长的消息需要拆分
    local msgTb = {}
    while true do
        if msg:len() > 500000 then
            local str = msg:sub(0, 500000)
            local idx = Util.lastFind(str, "\n")
            table.insert(msgTb, msg:sub(0, idx))
            msg = msg:sub(idx, msg:len())
        else
            table.insert(msgTb, msg)
            break
        end
    end

    for _, v in ipairs(msgTb) do
        self:sendMsg(define.showDialogMessage, { msg = v, type = type })
    end
end

---@public
---暂停
function DebugClient:pause(stack)
    self:sendMsg(define.pause, stack)
end

---@public
---发送变量域
---@param frameId number 堆栈 ID
---@param scopeInfo ScopeInfo 变量域数据
function DebugClient:sendScopes(frameId, scopeInfo)
    self:sendMsg(define.getScopes,
        {
            frameId = frameId,
            struct = scopeInfo.struct
        }
    )
end

---@public
---发送变量
---@param path string 原发送的变量路径
---@param frameId number 堆栈 ID
---@param vars any 变量
---@param tbkey string 表地址
---@param realPath string 真实变量路径
function DebugClient:sendVariable(path, frameId, vars, tbkey, realPath)
    self:sendMsg(
        define.getVariable,
        {
            path = path,
            frameId = frameId,
            vars = vars,
            tbkey = tbkey,
            realPath = realPath
        }
    )
end

---@public
---发送监视
---@param exp string 原发送的表达式
---@param frameId number 堆栈 ID
---@param ret any 计算结果
---@param tbkey string table 地址
---@param realPath string 真实路径
function DebugClient:sendWatch(exp, frameId, ret, tbkey, realPath)
    self:sendMsg(
        define.watchVariable,
        {
            exp = exp,
            frameId = frameId,
            vars = ret,
            tbkey = tbkey,
            realPath = realPath
        }
    )
end

---@public
---重置堆栈/异常情况的断点结束
function DebugClient:resetStackInfo()
    self:sendMsg(define.resetStackInfo)
end

---@public
---关闭连接
function DebugClient:close()
    self._client:close()
    self._client = nil
end

return DebugClient
