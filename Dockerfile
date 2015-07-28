FROM neverbland/nodejs-typescript

RUN mkdir /dnsgeo
WORKDIR /dnsgeo
COPY . /dnsgeo
WORKDIR /dnsgeo

RUN npm install 
RUN tsc 

ENTRYPOINT node leus-dns
