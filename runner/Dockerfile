FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app/runner

ENV PORT=8080
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY runner/package.json runner/package-lock.json ./
RUN npm ci --include=dev

COPY runner/tsconfig.json ./tsconfig.json
COPY runner/src ./src
COPY shared /app/shared
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8080
CMD ["npm", "run", "start:cloud-run"]
