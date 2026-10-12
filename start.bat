@echo off
rem Starts Self-Driving City and opens it in your browser.
cd /d "%~dp0"
start "" http://localhost:8080
node server.js
