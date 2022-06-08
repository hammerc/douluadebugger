local extends = DebugRequire("DebugExtends")
local class = extends.class
local json = DebugRequire("DebugJson")
local socket = DebugRequire("socket.core")

---@type number 接收超时时间
local MaxReceiveTimeOut = 1

---@class DebugServer 调试服务器
---@field _server userdata TCP 服务器
---@field _client userdata 连接上的客户端
---@author wizardc
local DebugServer = class("DebugServer")

function DebugServer:ctor()
end

---@private
---创建 TCP 服务器
---@param port number 监听端口
---@param backlog number 排队等待服务的客户端连接数
---@return userdata tcp 服务器
function DebugServer:serverBind(port, backlog)
    backlog = backlog or 30

    for i = port, port + 100 do
        local socketServer = socket.tcp()
        local res, err = socketServer:bind("0.0.0.0", i)
        if res and res == 1 then
            res, err = socketServer:listen(backlog)
            if res and res == 1 then
                return socketServer, i
            else
                printWarn("listen failed, " .. err .. ".", i, backlog)
                socketServer:close()
            end
        else
            printWarn("bind failed, " .. err .. ".", i)
            socketServer:close()
        end
    end

    printErr("No useful port found.")
    return nil
end

---@public
---创建服务
---@param port number 端口
---@return boolean 创建是否成功
function DebugServer:createServer(port)
    local socketServer, realPort = self:serverBind(port)
    if socketServer then
        local ip = socket.dns.toip(socket.dns.gethostname())
        print(string.format("The client(%s:%d) is ready, wait for debugger's connection", ip, realPort))
        self._server = socketServer
        self._server:settimeout(0)
        return true
    else
        return false
    end
end

---@public
---连接客户端，用于 Attach，所以只需要和一个客户端连接，连接成功后得到数据即可断开
---@return userdata 连接上后返回连接的客户端
function DebugServer:accept()
    if self._server then
        if not self._client then
            self._client = self._server:accept()
            if self._client then
                self._receiveTime = os.clock()
                self._client:settimeout(0)
                self._client:send("debug")
            end
        end
        return self._client
    end
    return nil
end

---@public
---接收客户端的消息
--- 注意：连接成功到接收到客户端的消息超过1秒时会断开连接
---@return table 客户端发送的数据
function DebugServer:receive()
    if self._client then
        local msg, status = self._client:receive()
        if msg then
            return json.decode(msg)
        elseif status == "closed" then
            self._client:close()
            self._client = nil
        end
    end
    if os.clock() - self._receiveTime >= MaxReceiveTimeOut then
        self._client:close()
        self._client = nil
    end
    return nil
end

---@public
---关闭连接
function DebugServer:close()
    if self._server then
        self._server:close()
        self._server = nil
    end
    if self._client then
        self._client:close()
        self._client = nil
    end
end

return DebugServer
