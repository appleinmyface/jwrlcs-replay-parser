import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { BoxcarsParser, NetworkParse } from '@jwrlcs/boxcars-wasm';
import { parseReplayFiles } from '../src/parser.mjs';
import { normalizeReplay } from '../src/normalize.mjs';

const directory=process.env.ETERNITY_SERIES_REPLAY_DIR;
// Expected Active-phase counts transcribed from the event/counter ledger.
// These are internally corroborated replay evidence, not visual ground truth.
const cases=[
  ['F1C6FD1011F1CC1599EFC991A9D8C6B3',7450,6,3,0,[1,3],[[0,2],[1,2],[1,0],[1,0],[2,1],[1,1]]],
  ['0529AD6611F1CC17B2DF88BD85912911',7264,6,4,23,[1,3],[[0,4],[1,0],[1,0],[1,1],[2,1],[1,0]]],
  ['3613364E11F1CC1801F288BD87D06070',7598,6,5,10,[2,4],[[0,3],[1,2],[0,0],[1,1],[0,0],[4,0]]],
  ['6FCF8B8411F1CC192CC8879C2D90E774',7189,5,3,0,[1,2],[[0,2],[0,2],[1,0],[1,0],[1,0],[2,1]]],
];
for(const [id,frameCount,eventCount,repeats,excluded,score,demos] of cases){
  test(`Eternity series ${id}: complete decode, exact identities, participant-only demos`,{skip:!directory},()=>{
    const bytes=fs.readFileSync(path.join(directory,id+'.replay'));
    const raw=new BoxcarsParser(bytes).setNetworkParse(NetworkParse.Always).parse();
    const game=parseReplayFiles([{name:id+'.replay',bytes}]).games[0];
    assert.equal(raw.network_frames.frames.length,frameCount);
    assert.equal(raw.properties.NumFrames,frameCount);
    assert.equal(game.parser_version,'0.3.0');
    assert.deepEqual(game.final_score,{blue:score[0],orange:score[1]});
    assert.equal(game.players.length,8);
    assert.equal(game.advanced_metrics.diagnostics.player_identities_resolved,8);
    assert.equal(game.advanced_metrics.metric_availability.demolitions.status,'verified');
    assert.equal(game.advanced_metrics.metric_availability.demolitions.metric_version,'jwrlcs-demolitions-v3');
    assert.equal(game.advanced_metrics.diagnostics.demolition_events_counted,eventCount);
    assert.equal(game.advanced_metrics.diagnostics.repeated_demolition_updates_ignored,repeats);
    assert.equal(game.advanced_metrics.diagnostics.non_gameplay_demolition_updates_ignored,excluded);
    assert.equal(game.advanced_metrics.diagnostics.unresolved_demolition_events,0);
    assert.deepEqual(game.advanced_metrics.diagnostics.recorded_demo_counter_mismatches,[]);
    const participants=game.players.filter(p=>p.participation.status==='car_observed');
    assert.equal(participants.length,6);
    assert.deepEqual(participants.map(p=>[p.advanced_statistics.demolitions_inflicted,p.advanced_statistics.demolitions_taken]),demos);
    assert.equal(new Set(game.players.map(p=>p.platform+':'+p.platform_user_id)).size,8);
    for(let i=0;i<game.players.length;i++){
      const p=game.players[i],h=raw.properties.PlayerStats.filter(h=>!h.bBot)[i];
      assert.equal(typeof p.platform_user_id,'string');
      assert.equal(p.replay_name,h.Name);
      assert.deepEqual(p.statistics,{score:h.Score??0,goals:h.Goals??0,assists:h.Assists??0,saves:h.Saves??0,shots:h.Shots??0});
      assert.equal(p.metric_availability.demolitions.independent_reference_status,'not_compared');
      if(p.team_color===null){
        assert.equal(p.participation.status,'no_car_observed');
        assert.equal(p.participation.team_assignment_observed,false);
        assert.equal(p.advanced_statistics.demolitions_inflicted,null);
        assert.equal(p.advanced_statistics.demolitions_taken,null);
        assert.equal(p.metric_availability.demolitions.status,'unavailable');
      }
      for(const key of ['boost','movement','positioning'])assert.ok(Object.values(p.advanced_statistics[key]).every(v=>v===null));
    }
    const playstation=game.players.find(p=>p.replay_name==='YaBoiiDerp');
    assert.equal(playstation.platform,'ps4'); // existing response identity is preserved
    assert.equal(crypto.createHash('sha256').update(playstation.platform_user_id).digest('hex'),'db390d3fbb24aff380de3c25264bd0a5b2951f79a059f6524e43a5b3b7d3586a');
    assert.equal(game.timing.overtime,null);
    assert.equal(game.timing.playing_duration_seconds,null);
    const scope=game.advanced_metrics.diagnostics.post_goal_counter_evidence;
    if(id.startsWith('0529')){
      assert.equal(scope.length,1);
      assert.equal(scope[0].replay_seconds,173.602);
      assert.equal(scope[0].attacker_player_name,'J a c o b .');
      assert.equal(scope[0].victim_player_name,'Program');
      assert.equal(scope[0].official_event_counted,false);
      assert.ok(game.warnings.some(w=>w.code==='DEMOLITION_COUNTER_SCOPE_DIFFERENCE'));
      const counterUpdate=raw.network_frames.frames.find(f=>f.time===173.60152).updated_actors.find(u=>
        u.actor_id===12 && raw.objects[u.object_id]==='TAGame.PRI_TA:MatchTimesDemolished');
      const saved=counterUpdate.attribute.Int;
      counterUpdate.attribute.Int=2;
      const unproven=normalizeReplay({fileName:id+'.replay',bytes,decoded:raw});
      counterUpdate.attribute.Int=saved;
      assert.equal(unproven.advanced_metrics.metric_availability.demolitions.status,'unavailable');
      assert.ok(unproven.players.every(p=>p.advanced_statistics.demolitions_inflicted===null));
      assert.ok(unproven.warnings.some(w=>w.code==='DEMOLITION_COUNTER_MISMATCH'));
    }else assert.deepEqual(scope,[]);
  });
}

test('four-game ordering and raw spectator entries survive series normalization',{skip:!directory},()=>{
  const series=parseReplayFiles([...cases].reverse().map(([id])=>({name:id+'.replay',bytes:fs.readFileSync(path.join(directory,id+'.replay'))})));
  assert.deepEqual(series.games.map(g=>g.source_file_name),cases.map(([id])=>id+'.replay'));
  assert.equal(series.contract_version,'0.3.0');
  assert.equal(series.games.reduce((n,g)=>n+g.players.length,0),32);
  assert.equal(series.games.reduce((n,g)=>n+g.players.filter(p=>p.participation.status==='no_car_observed').length,0),8);
});
