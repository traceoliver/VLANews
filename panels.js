/* =====================================================================
   V.L.A NEWS · 右栏面板渲染（首页与详情页共用）
   ---------------------------------------------------------------------
   用法：
     VLAPanels.render({
         rank:   document.getElementById('panel-rank'),     // 冠军榜
         recent: document.getElementById('panel-recent'),   // 近期夺冠
         heat:   document.getElementById('panel-heat'),     // 联赛热度
         empty:  '暂无数据'                                  // 可选
     }, titles);   // titles 是原始冠军记录数组

   冠军榜有三种口径，点标题右侧的按钮循环切换：
     世冠榜 → 联赛冠军榜（华超→辙甲循环）→ 冠军总数榜
   ===================================================================== */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* 三种口径 + 五个联赛，组成一个可循环的列表 */
    function buildModes() {
        var modes = [
            { key: 'world', title: '冠军榜 · 世冠', tabTitle: '世冠榜', btn: '世冠榜' },
            { key: 'total', title: '冠军榜 · 总数', tabTitle: '冠军总数榜', btn: '冠军总数榜' }
        ];
        /* 联赛口径插在世界榜和总数榜之间 */
        var leagueModes = VLAStats.LEAGUES.map(function (lg) {
            return { key: 'league:' + lg, title: '冠军榜 · ' + lg, tabTitle: lg + '联赛冠军榜', btn: lg, league: lg };
        });
        return [modes[0]].concat(leagueModes, [modes[1]]);
    }

    var state = { modeIndex: 0, titles: [] };
    var nodes = null;
    var modes = buildModes();

    /* 当前口径下的排名数据 */
    function rankingFor(mode) {
        if (mode.key === 'world') return VLAStats.worldRanking(state.titles);
        if (mode.key === 'total') return VLAStats.totalRanking(state.titles);
        return VLAStats.leagueRanking(state.titles, mode.league);
    }

    function renderRank() {
        if (!nodes.rank) return;
        var mode = modes[state.modeIndex];
        var rows = rankingFor(mode);

        var head = '<div class="panel-switch">' +
                       '<button type="button" class="switch-btn" data-cycle="1" ' +
                       'title="点击切换统计口径">' + esc(mode.btn) + ' ⇄</button>' +
                   '</div>';

        if (!rows.length) {
            nodes.rank.innerHTML = head + '<div class="panel-empty">暂无数据</div>';
            return;
        }
        /* 列表放在固定高度的滚动容器里：内容多可上下滑动，内容少则下方留空 */
        nodes.rank.innerHTML = head + '<div class="rank-scroll">' + rows.map(function (t, i) {
            var n = i + 1;
            var cls = n <= 3 ? ' r' + n : '';
            return '<div class="rank-row">' +
                       '<span class="rank-num' + cls + '">' + n + '</span>' +
                       '<span class="rank-name">' + esc(t.team) + '</span>' +
                       '<span class="rank-value">' + t.n + '</span>' +
                   '</div>';
        }).join('') + '</div>';

        /* 只有内容真的超出时才加底部渐隐。
           否则短列表（比如只有 3 条）会被渐隐压掉一点，下面又留空，看起来会怪。 */
        markOverflow(nodes.rank);
    }

    /* 检查滚动容器是否溢出，溢出了才挂 .has-overflow（CSS 里负责渐隐） */
    function markOverflow(container) {
        if (!container || !container.querySelector) return;
        var box = container.querySelector('.rank-scroll, .recent-scroll');
        if (!box) return;
        var check = function () {
            var overflowing = box.scrollHeight > box.clientHeight + 2;
            var has = (' ' + box.className + ' ').indexOf(' has-overflow ') >= 0;
            if (overflowing && !has) box.className += ' has-overflow';
            else if (!overflowing && has) box.className = box.className.replace(/\s*has-overflow/, '');
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(check);
        else check();
    }

    /* 近期夺冠：可滚动的固定高度窗口 */
    function renderRecent() {
        if (!nodes.recent) return;
        var N = 12;                       /* 窗口里放多少条，多了靠滚动看 */
        var rows = VLAStats.recent(state.titles, N);

        if (!rows.length) {
            nodes.recent.innerHTML = '<div class="panel-empty">暂无数据</div>';
            return;
        }
        nodes.recent.innerHTML =
            '<div class="recent-scroll">' +
                rows.map(function (r) {
                    return '<div class="recent-row">' +
                               '<span class="recent-year">' + esc(r.season) + '</span>' +
                               '<span class="recent-team">' + esc(r.team) + '</span>' +
                               '<span class="recent-type">' + esc(VLAStats.label(r)) + '</span>' +
                           '</div>';
                }).join('') +
            '</div>' +
            '<div class="recent-hint">可上下滑动</div>';
        markOverflow(nodes.recent);
    }

    /* 联赛热度：优先用第二个项目的助威值。
       注意加载过程：首次渲染不放任何"临时数值"，避免先闪一组和最终值差很多的
       数字（比如按冠军数算的 26% 和按助威算的 44%）。等数据到了再渲染；
       真拿不到数据时才归零。 */
    function renderHeat() {
        if (!nodes.heat) return;

        function heatRowsHtml(list) {
            return list.map(function (h) {
                return '<div class="heat-row">' +
                           '<span class="heat-name">' + esc(h.league) + '</span>' +
                           '<div class="heat-bar"><div class="heat-fill" style="width:' + h.pct + '%"></div></div>' +
                           '<span class="heat-pct">' + h.pct + '%</span>' +
                       '</div>';
            }).join('');
        }
        /* 五个联赛都显示 0%（数据取不到时的最终呈现） */
        function zeroRows() {
            return VLAStats.LEAGUES.map(function (lg) {
                return { league: lg, pct: 0 };
            });
        }
        /* 加载中的占位：只显示联赛名和空槽，不显示任何数字 */
        function loadingRows() {
            return '<div class="heat-loading">' +
                VLAStats.LEAGUES.map(function (lg) {
                    return '<div class="heat-row">' +
                               '<span class="heat-name">' + esc(lg) + '</span>' +
                               '<div class="heat-bar"><div class="heat-fill" style="width:0%"></div></div>' +
                               '<span class="heat-pct">—</span>' +
                           '</div>';
                }).join('') +
            '</div>';
        }

        /* 已经拿到助威数据：直接用 */
        if (state.cheers && state.cheers.length) {
            nodes.heat.innerHTML = heatRowsHtml(state.cheers);
            return;
        }
        /* 上次已经确认取不到：归零，不再重复请求 */
        if (state.cheersFailed) {
            nodes.heat.innerHTML = heatRowsHtml(zeroRows());
            return;
        }

        /* 首次进入：先放占位，不发临时数值 */
        nodes.heat.innerHTML = loadingRows();

        if (!window.VLA || typeof VLA.leagueCheers !== 'function') {
            state.cheersFailed = true;
            nodes.heat.innerHTML = heatRowsHtml(zeroRows());
            return;
        }
        VLA.leagueCheers().then(function (cheers) {
            if (!nodes.heat) return;
            if (cheers && cheers.length) {
                state.cheers = cheers;
                nodes.heat.innerHTML = heatRowsHtml(cheers);
            } else {
                state.cheersFailed = true;
                nodes.heat.innerHTML = heatRowsHtml(zeroRows());
            }
        }).catch(function () {
            state.cheersFailed = true;
            if (nodes.heat) nodes.heat.innerHTML = heatRowsHtml(zeroRows());
        });
    }

    function renderAll() {
        renderRank();
        renderRecent();
        renderHeat();
    }

    function render(refs, titles) {
        nodes = refs || {};
        state.titles = VLAStats.normalize(titles || []);

        if (nodes.rank) {
            nodes.rank.addEventListener('click', function (ev) {
                var btn = ev.target && ev.target.closest ? ev.target.closest('[data-cycle]') : null;
                if (!btn) return;
                state.modeIndex = (state.modeIndex + 1) % modes.length;
                renderRank();
            });
        }
        renderAll();
    }

    global.VLAPanels = {
        render: render,
        /* 供测试或外部使用 */
        _modes: function () { return modes; },
        _state: state,
        _markOverflow: markOverflow
    };
})(window);
