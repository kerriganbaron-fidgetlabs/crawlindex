@echo off
REM CrawlIndex nightly crawl.
REM
REM Registered with Windows Task Scheduler as "CrawlIndex - nightly crawl".
REM The site reads Supabase directly through ISR, so a completed crawl is live within the
REM hour with no deploy step. Nothing here needs to touch Vercel.
REM
REM Runs "missed" on wake, because this machine is not always on overnight and a skipped
REM night would leave the index quietly stale.

setlocal
cd /d C:\Builder\crawlindex

set LOGDIR=C:\Builder\crawlindex\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set DT=%%I
set STAMP=%DT:~0,8%

echo ==== CrawlIndex nightly start %DATE% %TIME% ==== >> "%LOGDIR%\crawl-%STAMP%.log"

REM Refresh Tranco ranks and demote any newly recognised infrastructure hosts on Mondays.
if "%DATE:~0,3%"=="Mon" (
  call pnpm seed --count 5000 >> "%LOGDIR%\crawl-%STAMP%.log" 2>&1
)

call pnpm crawl --limit 6000 --concurrency 20 >> "%LOGDIR%\crawl-%STAMP%.log" 2>&1
set CRAWL_EXIT=%ERRORLEVEL%

echo ==== CrawlIndex nightly end %DATE% %TIME% exit=%CRAWL_EXIT% ==== >> "%LOGDIR%\crawl-%STAMP%.log"

REM Keep a fortnight of logs, no more.
forfiles /p "%LOGDIR%" /m crawl-*.log /d -14 /c "cmd /c del @path" 2>nul

exit /b %CRAWL_EXIT%
