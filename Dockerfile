from node:alpine

workdir /app

copy ./yarn.lock ./package.json .

run yarn

copy ./ ./

run yarn build

expose 420

cmd ["yarn", "start"]