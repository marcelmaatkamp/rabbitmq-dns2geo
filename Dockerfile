FROM neverbland/nodejs-typescript

RUN mkdir /dnsgeo
WORKDIR /dnsgeo
COPY . /dnsgeo
WORKDIR /dnsgeo

RUN npm install 
RUN tsc 

ENV API_GOOGLE CHANGE_ME

ENTRYPOINT node leus-dns
