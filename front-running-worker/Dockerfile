FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
# HEADLESS=false runs a real (headed) Chromium on a virtual display.
CMD ["sh", "-c", "if [ \"$HEADLESS\" = \"false\" ]; then exec xvfb-run -a --server-args='-screen 0 1366x850x24' npx tsx src/cli.ts scheduler; else exec npx tsx src/cli.ts scheduler; fi"]
