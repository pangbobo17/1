// node web/link.test.mjs
import assert from 'node:assert/strict';
import { findURL, platformOf, nameFromURL } from './link.js';

assert.equal(findURL('7.15 复制打开抖音，看看【某某的作品】 https://v.douyin.com/iAbCdEf/ 复制此链接').href, 'https://v.douyin.com/iAbCdEf/');
assert.equal(findURL('【晴天-哔哩哔哩】 https://b23.tv/xyz123').href, 'https://b23.tv/xyz123');
assert.equal(findURL('没有链接'), null);
assert.equal(findURL('https://example.com/a/%E6%99%B4%E5%A4%A9.mp3').href, 'https://example.com/a/%E6%99%B4%E5%A4%A9.mp3');
assert.equal(platformOf(findURL('https://v.douyin.com/x/')), '抖音');
assert.equal(platformOf(findURL('https://www.bilibili.com/video/BV1')), 'B站');
assert.equal(platformOf(findURL('https://music.163.com/song?id=1')), '网易云音乐');
assert.equal(platformOf(findURL('https://y.qq.com/n/ryqq/songDetail/1')), 'QQ 音乐');
assert.equal(platformOf(findURL('https://cdn.example.com/podcast/ep1.mp3')), null);
assert.equal(platformOf(findURL('https://notbilibili.com/x.mp3')), null);
assert.equal(nameFromURL(findURL('https://example.com/a/%E6%99%B4%E5%A4%A9.mp3?x=1')), '晴天');
assert.equal(nameFromURL(findURL('https://example.com/')), 'example.com');
console.log('all link tests passed');
