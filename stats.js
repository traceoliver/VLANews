/* =====================================================================
   V.L.A NEWS · 冠军统计（纯逻辑，两个页面共用）
   ---------------------------------------------------------------------
   输入是原始的冠军记录数组，输出排名、近期夺冠、热度等统计结果。
   这一份被 index.html 和 article.html 共用，避免两处各写一份、
   以后改一处忘一处。
   ===================================================================== */
(function (global) {
    'use strict';

    var LEAGUES = ['华超', '锐超', '枫超', '晴甲', '辙甲'];
    var KINDS = ['世冠', '联赛', '杯赛'];

    /* 排序权重：数字越小越靠前 */
    var KIND_WEIGHT = { '世冠': 0, '联赛': 1, '杯赛': 2 };
    function weightOf(kind) {
        return KIND_WEIGHT[kind] === undefined ? 9 : KIND_WEIGHT[kind];
    }
    function leagueIndex(lg) {
        var i = LEAGUES.indexOf(lg);
        return i === -1 ? 9 : i;
    }

    /* 把原始行归一化，兼容 Supabase 返回的各种字段名 */
    function normalize(rows) {
        return (rows || []).map(function (r) {
            if (!r || typeof r !== 'object') return null;
            var team = r.team || r.champion || r.name || '';
            var kind = r.kind || r.type || r.category || '';
            if (!team || !kind) return null;
            return {
                season: String(r.season || r.year || '').trim(),
                kind: kind,
                league: r.league || null,
                team: String(team).replace(/\d+$/, '').trim()   /* 去掉队名尾部的积分数字 */
            };
        }).filter(function (r) { return r && r.team && r.season; });
    }

    /* 赛季排序键：'21-22' → 2122，越大越新 */
    function seasonKey(season) {
        var m = String(season).match(/^(\d{2})-(\d{2})$/);
        if (m) return Number(m[1]) * 100 + Number(m[2]);
        return 0;
    }

    /* 分组计数，降序；同数按名称稳定排序 */
    function tally(records) {
        var map = {};
        records.forEach(function (r) {
            map[r.team] = (map[r.team] || 0) + 1;
        });
        return Object.keys(map).map(function (team) {
            return { team: team, n: map[team] };
        }).sort(function (a, b) {
            return b.n - a.n || a.team.localeCompare(b.team, 'zh');
        });
    }

    /* 口径一：世冠榜 */
    function worldRanking(records) {
        return tally(records.filter(function (r) { return r.kind === '世冠'; }));
    }

    /* 口径二：某联赛的联赛冠军榜 */
    function leagueRanking(records, league) {
        return tally(records.filter(function (r) {
            return r.kind === '联赛' && r.league === league;
        }));
    }

    /* 口径三：冠军总数榜（世冠 + 联赛 + 杯赛） */
    function totalRanking(records) {
        return tally(records);
    }

    /* 某个联赛出现过多少次联赛冠军记录（用于统计覆盖情况） */
    function leagueSeasons(records, league) {
        return records.filter(function (r) {
            return r.kind === '联赛' && r.league === league;
        }).length;
    }

    /* 近期夺冠：世冠 > 联赛 > 杯赛；同优先级时赛季新的在前；
       同一赛季内按联赛顺序（华超→辙甲），让列表读起来有规律。 */
    function recent(records, limit) {
        var sorted = records.slice().sort(function (a, b) {
            var ka = seasonKey(a.season), kb = seasonKey(b.season);
            if (ka !== kb) return kb - ka;
            var w = weightOf(a.kind) - weightOf(b.kind);
            if (w) return w;
            return leagueIndex(a.league) - leagueIndex(b.league);
        });
        return limit ? sorted.slice(0, limit) : sorted;
    }

    /* 一行记录在列表里怎么称呼自己：世冠 / 华超联赛 / 枫超杯赛 */
    function label(r) {
        if (r.kind === '世冠') return '世冠';
        return (r.league || '') + r.kind;
    }

    /* 联赛热度：按该联赛的冠军记录数占全部记录的比例 */
    function leagueHeat(records) {
        var counts = {}, total = 0;
        records.forEach(function (r) {
            if (!r.league) return;
            counts[r.league] = (counts[r.league] || 0) + 1;
            total++;
        });
        return LEAGUES.filter(function (lg) { return counts[lg]; }).map(function (lg) {
            return {
                league: lg,
                count: counts[lg],
                pct: total ? Math.round(counts[lg] / total * 100) : 0
            };
        });
    }

    /* 数据概览，用于网格编辑器之类的场景 */
    function summary(records) {
        var out = { total: records.length, byKind: {}, seasons: [] };
        KINDS.forEach(function (k) { out.byKind[k] = 0; });
        var seen = {};
        records.forEach(function (r) {
            if (out.byKind[r.kind] !== undefined) out.byKind[r.kind]++;
            if (!seen[r.season]) { seen[r.season] = 1; out.seasons.push(r.season); }
        });
        out.seasons.sort(function (a, b) { return seasonKey(a) - seasonKey(b); });
        return out;
    }

    global.VLAStats = {
        LEAGUES: LEAGUES,
        KINDS: KINDS,
        normalize: normalize,
        seasonKey: seasonKey,
        tally: tally,
        worldRanking: worldRanking,
        leagueRanking: leagueRanking,
        totalRanking: totalRanking,
        leagueSeasons: leagueSeasons,
        recent: recent,
        label: label,
        leagueHeat: leagueHeat,
        summary: summary
    };
})(window);
