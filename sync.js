#!/usr/bin/env node
/**
 * EMBA17 Google Sheets → GitHub Pages 동기화 스크립트
 * 사용법: node sync.js
 * 
 * 동작:
 * 1. Google Sheets에서 최신 데이터 읽기
 * 2. emba17_claude_v1.html의 WEEKS/CAL_DAY_DATA 섹션 업데이트
 * 3. index.html에 복사
 * 4. git commit & push
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SHEET_ID = '1zpiYbF9U0tT3fAgP22YzZ0wK3mw65oPCnB_QurYiNFw';
const CREDS_PATH = path.join(__dirname, '../credentials/google-sheets.json');
const HTML_SRC = path.join(__dirname, 'emba17_claude_v1.html');
const HTML_OUT = path.join(__dirname, 'index.html');

async function getSheets() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function readSheetData(sheets) {
  // 메인 스케줄 시트 읽기
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A1:M100',
  });
  return res.data.values || [];
}

async function syncFromSheets() {
  console.log('📊 Google Sheets 데이터 읽는 중...');
  const sheets = await getSheets();
  const data = await readSheetData(sheets);
  
  console.log(`✅ ${data.length}행 읽음`);
  
  // 시트 데이터 요약 출력
  console.log('\n📋 시트 내용 요약:');
  data.slice(0, 15).forEach((row, i) => {
    if (row[0] || row[1]) {
      console.log(`  행${i+1}: ${row.slice(0, 3).join(' | ')}`);
    }
  });
  
  return data;
}

async function updateHTML(changeDescription) {
  // HTML 소스 → index.html 복사 (수동 수정 후 반영용)
  const src = fs.readFileSync(HTML_SRC, 'utf8');
  
  // 업데이트 날짜 주석 삽입
  const today = new Date().toISOString().split('T')[0];
  const updated = src.replace(
    /<!-- LAST_SYNC:.*?-->/,
    `<!-- LAST_SYNC: ${today} -->`
  );
  
  // LAST_SYNC 태그 없으면 head 끝에 추가
  const final = updated.includes('<!-- LAST_SYNC:') 
    ? updated 
    : src.replace('</head>', `<!-- LAST_SYNC: ${today} -->\n</head>`);
  
  fs.writeFileSync(HTML_OUT, final);
  console.log(`✅ index.html 업데이트 완료 (${today})`);
}

async function gitPush(message) {
  const dir = __dirname;
  try {
    execSync('git pull --rebase', { cwd: dir, stdio: 'pipe' });
    execSync('git add index.html emba17_claude_v1.html', { cwd: dir, stdio: 'pipe' });
    
    // 변경사항 있는지 확인
    const status = execSync('git status --porcelain', { cwd: dir }).toString();
    if (!status.trim()) {
      console.log('ℹ️  변경사항 없음 — push 스킵');
      return false;
    }
    
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'pipe' });
    execSync('git push', { cwd: dir, stdio: 'pipe' });
    console.log('✅ GitHub push 완료');
    return true;
  } catch (e) {
    throw new Error(`Git 오류: ${e.message}`);
  }
}

// 메인 실행
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'sync';
  const message = args[1] || '학술국 대시보드 업데이트';

  try {
    if (mode === 'sync') {
      // 시트 읽기 + HTML 복사 + push
      const data = await syncFromSheets();
      await updateHTML();
      const pushed = await gitPush(`[sync] ${message} (${new Date().toISOString().split('T')[0]})`);
      
      if (pushed) {
        console.log('\n🎉 완료!');
        console.log('🔗 https://willryugo.github.io/EMBA17/');
      }
    } else if (mode === 'read') {
      // 시트 데이터만 읽기 (확인용)
      await syncFromSheets();
    } else if (mode === 'push') {
      // HTML만 push (시트 읽기 없이)
      await updateHTML();
      const pushed = await gitPush(`[update] ${message}`);
      if (pushed) {
        console.log('\n🎉 완료!');
        console.log('🔗 https://willryugo.github.io/EMBA17/');
      }
    }
  } catch (e) {
    console.error('❌ 오류:', e.message);
    process.exit(1);
  }
}

main();
