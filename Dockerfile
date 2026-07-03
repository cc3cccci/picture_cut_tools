# 使用极其轻量的 Alpine Node 镜像，原生支持 ARM64/ARMv7 (Armbian 主流)
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖描述文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制项目代码
COPY . .

# 暴露服务端口
EXPOSE 5002

# 环境变量设置
ENV PORT=5002
ENV NODE_ENV=production

# 启动服务
CMD ["node", "start-server.js"]
