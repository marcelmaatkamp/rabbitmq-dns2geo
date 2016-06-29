FROM neverbland/nodejs-typescript:1.3.2

RUN mkdir /dnsgeo
WORKDIR /dnsgeo
COPY . /dnsgeo
WORKDIR /dnsgeo

RUN npm install 
RUN tsc 

ENTRYPOINT node leus-dns
