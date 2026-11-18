import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEAMS,ENTRIES,startingGrid,physics,rating} from './teams.js';
test('grid has exactly four front, four midfield and two developing teams, with two equal cars each',()=>{
  assert.equal(TEAMS.length,10);assert.equal(ENTRIES.length,20);
  for(const [tier,count] of [['front',4],['mid',4],['back',2]])assert.equal(TEAMS.filter(t=>t.tier===tier).length,count);
  assert.equal(new Set(ENTRIES.map(e=>e.number)).size,20);
  for(const team of TEAMS){let entries=ENTRIES.filter(e=>e.team===team);assert.equal(entries.length,2);assert.deepEqual(entries[0].performance,entries[1].performance);}
});
test('automatic starting grid preserves all twenty entries and orders teams by base performance',()=>{
  let grid=startingGrid();assert.equal(grid.length,20);assert.equal(new Set(grid.map(e=>e.grid)).size,20);assert.equal(new Set(grid.map(e=>e.id)).size,20);
  for(let i=1;i<grid.length;i++)assert.ok(rating(grid[i-1].team)>=rating(grid[i].team));
});
test('competitive groups have a genuine performance gap without making developing cars undrivable',()=>{
  const front=TEAMS.filter(t=>t.tier==='front'),mid=TEAMS.filter(t=>t.tier==='mid'),back=TEAMS.filter(t=>t.tier==='back');
  assert.ok(Math.min(...front.map(rating))>Math.max(...mid.map(rating)));assert.ok(Math.min(...mid.map(rating))>Math.max(...back.map(rating)));
  for(const team of TEAMS){let p=physics(team);assert.ok(p.maxSpeed>410&&p.maxSpeed<450);assert.ok(p.acceleration>155&&p.acceleration<220);assert.ok(p.braking>340&&p.braking<400);assert.ok(p.grip>8&&p.grip<11);}
  assert.ok(Math.min(...front.map(t=>physics(t).acceleration))>Math.max(...back.map(t=>physics(t).acceleration)));
});
