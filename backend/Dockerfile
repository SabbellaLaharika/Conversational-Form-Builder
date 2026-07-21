FROM node:20-alpine

# Install curl for healthcheck
RUN apk update && apk add --no-cache curl

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
