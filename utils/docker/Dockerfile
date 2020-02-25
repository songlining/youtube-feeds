FROM mhart/alpine-node:6

RUN apk update && apk upgrade && \
    apk add --no-cache git ca-certificates

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app/
RUN git clone https://github.com/songlining/youtube-feeds.git
RUN apk del git
WORKDIR /usr/src/app/youtube-feeds
RUN npm install
COPY ./env.json controller
RUN rm -rf .git
RUN rm -rf test
EXPOSE 6003
CMD [ "npm", "start" ]
