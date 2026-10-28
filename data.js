/* =====================================================================
   V.L.A NEWS · 文章数据层
   ---------------------------------------------------------------------
   首页（index.html）和详情页（article.html）都只通过这个文件取数据。
   你新增一篇资讯时，改动只发生在一个地方：Supabase（推荐）或下面的
   SAMPLE 数组（离线兜底），不需要动任何 HTML。

   三种运行状态：
     1. SUPABASE_URL 已配置且网络可达  → 读 Supabase
     2. 没配置 / 网络不可达 / 查询报错 → 自动退回 SAMPLE（页面照常能看）
     3. 当前处于哪种状态，可用 VLA.source() 查询：'supabase' 或 'fallback'

   公开挂到 GitHub Pages 时务必注意：
     · anon key 本来就是给浏览器用的公开钥匙，可以放在这里；
     · 但前提是 Supabase 表上开启了 RLS 行级安全：匿名只读、写入仅限登录用户。
       否则任何人都能用这把钥匙往你的库里写数据。
   ===================================================================== */
(function (global) {
    'use strict';

    /* =================================================================
       ① 配置区 —— 接 Supabase 只需要改这两行
       ================================================================= */
    var SUPABASE_URL = 'https://uiuwmexmpdatfucntsqa.supabase.co';   // 例：'https://abcdefghijklmn.supabase.co'（结尾不要带 /）
    var SUPABASE_ANON_KEY = 'sb_publishable_tTCQEBJCZn0wvj_mRVeVlg_GUcdgBpY';   // 例：'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    var TABLE = 'articles';   // Supabase 里的表名
    var LIST_LIMIT = 200;    // 首页一次最多取多少条

    /* -----------------------------------------------------------------
       ①-b 第二个 Supabase 项目：球队助威值（用于「联赛热度」和「总助威」）
       -----------------------------------------------------------------
       那个项目里只有一张 teams 表：id（文本）/ name / votes。
       没有联赛列，所以联赛归属按 id 排序后每 8 支一档来划分。
       ----------------------------------------------------------------- */
    var CHEER_URL = 'https://nljoumpxrtusmjukbatq.supabase.co';
    var CHEER_KEY = 'sb_publishable_umNHPecNIEY7tyur9a_zzA_Hj5wi71h';
    var CHEER_TABLE = 'teams';
    var TEAMS_PER_LEAGUE = 8;   // 每 8 支球队归入一个联赛
    var LEAGUE_NAMES = ['华超', '锐超', '枫超', '晴甲', '辙甲'];

    /* 说明：右栏的「冠军榜 / 近期夺冠」由 titles（冠军记录）实时统计；
       「联赛热度」优先用上面这个项目的助威值，取不到时退回按冠军数计算。
       冠军数据用本地发稿台的"冠军记录"表格页维护。 */

    var configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
    var cheerConfigured = !!(CHEER_URL && CHEER_KEY);
    var listCache = null;    // 首页列表缓存，避免详情页重复请求整个列表
    var currentSource = configured ? 'supabase' : 'fallback';
    var titlesSource = configured ? 'supabase' : 'fallback';
    var cheerSource = cheerConfigured ? 'supabase' : 'fallback';
    var teamsCache = null;   // 球队助威数据缓存（只请求一次）

    /* =================================================================
       ② 离线兜底数据 —— 与 Supabase 表结构保持一致
       =================================================================
       字段说明：
         slug     详情页地址里的标识，唯一、建议纯英文小写加连字符
         title    标题
         summary  摘要（列表页显示，也作为正文缺失时的兜底）
         body     正文，段落之间空一行即可，页面会拆成 <p>
         date     日期 YYYY-MM-DD（列表按它倒序）
         league   所属联赛，用于筛选
         tag      分类：世冠 / 联赛 / 杯赛 / 里程碑 / 流言板
         author   署名，可留空
         hero     true 表示显示为头条大卡
       ================================================================= */
    /* =================================================================
       ③ 冠军记录兜底数据 —— 与 Supabase 的 titles 表结构一致
       =================================================================
       共 158 条，覆盖 21-22 到 38-39 共 18 个赛季。
       这里只是"读不到数据库时的备用显示"，日常请用本地发稿台的
       冠军记录表格页来增删改（那样不用重新上传文件）。
       字段：season 赛季 / kind 世冠|联赛|杯赛 / league 联赛（世冠无）/ team 球队
       ================================================================= */
    var SAMPLE_TITLES = [
            { season: '21-22', kind: '世冠', team: '石韵' },
            { season: '21-22', kind: '联赛', league: '华超', team: '极道' },
            { season: '21-22', kind: '联赛', league: '锐超', team: '川流' },
            { season: '21-22', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '21-22', kind: '杯赛', league: '华超', team: '口福居' },
            { season: '21-22', kind: '杯赛', league: '锐超', team: '风启' },
            { season: '21-22', kind: '杯赛', league: '枫超', team: '雾都漫游者' },
            { season: '22-23', kind: '世冠', team: '口福居' },
            { season: '22-23', kind: '联赛', league: '华超', team: '口福居' },
            { season: '22-23', kind: '联赛', league: '锐超', team: '火燃' },
            { season: '22-23', kind: '联赛', league: '枫超', team: '北港FC' },
            { season: '22-23', kind: '杯赛', league: '华超', team: '兰庭' },
            { season: '22-23', kind: '杯赛', league: '锐超', team: '林深' },
            { season: '22-23', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '23-24', kind: '世冠', team: '风车郡' },
            { season: '23-24', kind: '联赛', league: '华超', team: '口福居' },
            { season: '23-24', kind: '联赛', league: '锐超', team: '云驰' },
            { season: '23-24', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '23-24', kind: '杯赛', league: '华超', team: '兰庭' },
            { season: '23-24', kind: '杯赛', league: '锐超', team: '火燃' },
            { season: '23-24', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '24-25', kind: '世冠', team: '兰庭' },
            { season: '24-25', kind: '联赛', league: '华超', team: '临淇' },
            { season: '24-25', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '24-25', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '24-25', kind: '杯赛', league: '华超', team: '极道' },
            { season: '24-25', kind: '杯赛', league: '锐超', team: '云驰' },
            { season: '24-25', kind: '杯赛', league: '枫超', team: '沃斯维尔' },
            { season: '25-26', kind: '世冠', team: '极道' },
            { season: '25-26', kind: '联赛', league: '华超', team: '兰庭' },
            { season: '25-26', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '25-26', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '25-26', kind: '杯赛', league: '华超', team: '悟言社' },
            { season: '25-26', kind: '杯赛', league: '锐超', team: '风启' },
            { season: '25-26', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '26-27', kind: '世冠', team: '极道' },
            { season: '26-27', kind: '联赛', league: '华超', team: '刀枪剑戟' },
            { season: '26-27', kind: '联赛', league: '锐超', team: '林深' },
            { season: '26-27', kind: '联赛', league: '枫超', team: '溪木河谷' },
            { season: '26-27', kind: '杯赛', league: '华超', team: '瑰绽' },
            { season: '26-27', kind: '杯赛', league: '锐超', team: '云驰' },
            { season: '26-27', kind: '杯赛', league: '枫超', team: '沃斯维尔' },
            { season: '27-28', kind: '世冠', team: '雷动' },
            { season: '27-28', kind: '联赛', league: '华超', team: '瑰绽' },
            { season: '27-28', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '27-28', kind: '联赛', league: '枫超', team: '雾都漫游者' },
            { season: '27-28', kind: '杯赛', league: '华超', team: '口福居' },
            { season: '27-28', kind: '杯赛', league: '锐超', team: '云驰' },
            { season: '27-28', kind: '杯赛', league: '枫超', team: '灰石联' },
            { season: '28-29', kind: '世冠', team: '瑰绽' },
            { season: '28-29', kind: '联赛', league: '华超', team: '极道' },
            { season: '28-29', kind: '联赛', league: '锐超', team: '火燃' },
            { season: '28-29', kind: '联赛', league: '枫超', team: '橡林队' },
            { season: '28-29', kind: '杯赛', league: '华超', team: '瑰绽' },
            { season: '28-29', kind: '杯赛', league: '锐超', team: '火燃' },
            { season: '28-29', kind: '杯赛', league: '枫超', team: '沃斯维尔' },
            { season: '29-30', kind: '世冠', team: '风启' },
            { season: '29-30', kind: '联赛', league: '华超', team: '烬' },
            { season: '29-30', kind: '联赛', league: '锐超', team: '云驰' },
            { season: '29-30', kind: '联赛', league: '枫超', team: '雾都漫游者' },
            { season: '29-30', kind: '杯赛', league: '华超', team: '刀枪剑戟' },
            { season: '29-30', kind: '杯赛', league: '锐超', team: '火燃' },
            { season: '29-30', kind: '杯赛', league: '枫超', team: '溪木河谷' },
            { season: '30-31', kind: '世冠', team: '烬' },
            { season: '30-31', kind: '联赛', league: '华超', team: '口福居' },
            { season: '30-31', kind: '联赛', league: '锐超', team: '林深' },
            { season: '30-31', kind: '联赛', league: '枫超', team: '橡林队' },
            { season: '30-31', kind: '杯赛', league: '华超', team: '口福居' },
            { season: '30-31', kind: '杯赛', league: '锐超', team: '林深' },
            { season: '30-31', kind: '杯赛', league: '枫超', team: '风车郡' },
            { season: '31-32', kind: '世冠', team: '传奇长歌' },
            { season: '31-32', kind: '联赛', league: '华超', team: '烬' },
            { season: '31-32', kind: '联赛', league: '锐超', team: '风启' },
            { season: '31-32', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '31-32', kind: '联赛', league: '晴甲', team: '纯染' },
            { season: '31-32', kind: '联赛', league: '辙甲', team: 'OTR' },
            { season: '31-32', kind: '杯赛', league: '华超', team: '兰庭' },
            { season: '31-32', kind: '杯赛', league: '锐超', team: '石韵' },
            { season: '31-32', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '31-32', kind: '杯赛', league: '晴甲', team: '余音' },
            { season: '31-32', kind: '杯赛', league: '辙甲', team: 'OTR' },
            { season: '32-33', kind: '世冠', team: '林深' },
            { season: '32-33', kind: '联赛', league: '华超', team: '烬' },
            { season: '32-33', kind: '联赛', league: '锐超', team: '火燃' },
            { season: '32-33', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '32-33', kind: '联赛', league: '晴甲', team: '长歌FC' },
            { season: '32-33', kind: '联赛', league: '辙甲', team: 'OTR' },
            { season: '32-33', kind: '杯赛', league: '华超', team: '悟言社' },
            { season: '32-33', kind: '杯赛', league: '锐超', team: '川流' },
            { season: '32-33', kind: '杯赛', league: '枫超', team: '北港FC' },
            { season: '32-33', kind: '杯赛', league: '晴甲', team: '传奇长歌' },
            { season: '32-33', kind: '杯赛', league: '辙甲', team: '月牙楼之子' },
            { season: '33-34', kind: '世冠', team: '长歌FC' },
            { season: '33-34', kind: '联赛', league: '华超', team: '烬' },
            { season: '33-34', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '33-34', kind: '联赛', league: '枫超', team: '橡林队' },
            { season: '33-34', kind: '联赛', league: '晴甲', team: '纯染' },
            { season: '33-34', kind: '联赛', league: '辙甲', team: '猎塔' },
            { season: '33-34', kind: '杯赛', league: '华超', team: '刀枪剑戟' },
            { season: '33-34', kind: '杯赛', league: '锐超', team: '石韵' },
            { season: '33-34', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '33-34', kind: '杯赛', league: '晴甲', team: '长歌FC' },
            { season: '33-34', kind: '杯赛', league: '辙甲', team: '猎塔' },
            { season: '34-35', kind: '世冠', team: '极道' },
            { season: '34-35', kind: '联赛', league: '华超', team: '瑰绽' },
            { season: '34-35', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '34-35', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '34-35', kind: '联赛', league: '晴甲', team: '终末静音' },
            { season: '34-35', kind: '联赛', league: '辙甲', team: '猎塔' },
            { season: '34-35', kind: '杯赛', league: '华超', team: '瑰绽' },
            { season: '34-35', kind: '杯赛', league: '锐超', team: '雷动' },
            { season: '34-35', kind: '杯赛', league: '枫超', team: '洛普镇' },
            { season: '34-35', kind: '杯赛', league: '晴甲', team: '传奇长歌' },
            { season: '34-35', kind: '杯赛', league: '辙甲', team: '布雷博林' },
            { season: '35-36', kind: '世冠', team: '口福居' },
            { season: '35-36', kind: '联赛', league: '华超', team: '烬' },
            { season: '35-36', kind: '联赛', league: '锐超', team: '火燃' },
            { season: '35-36', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '35-36', kind: '联赛', league: '晴甲', team: '长歌FC' },
            { season: '35-36', kind: '联赛', league: '辙甲', team: 'OTR' },
            { season: '35-36', kind: '杯赛', league: '华超', team: '烬' },
            { season: '35-36', kind: '杯赛', league: '锐超', team: '石韵' },
            { season: '35-36', kind: '杯赛', league: '枫超', team: '橡林队' },
            { season: '35-36', kind: '杯赛', league: '晴甲', team: '长歌FC' },
            { season: '35-36', kind: '杯赛', league: '辙甲', team: '扬名' },
            { season: '36-37', kind: '世冠', team: '传奇长歌' },
            { season: '36-37', kind: '联赛', league: '华超', team: '烬' },
            { season: '36-37', kind: '联赛', league: '锐超', team: '石韵' },
            { season: '36-37', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '36-37', kind: '联赛', league: '晴甲', team: '传奇长歌' },
            { season: '36-37', kind: '联赛', league: '辙甲', team: '猎塔' },
            { season: '36-37', kind: '杯赛', league: '华超', team: '口福居' },
            { season: '36-37', kind: '杯赛', league: '锐超', team: '云驰' },
            { season: '36-37', kind: '杯赛', league: '枫超', team: '沃斯维尔' },
            { season: '36-37', kind: '杯赛', league: '晴甲', team: '纯染' },
            { season: '36-37', kind: '杯赛', league: '辙甲', team: '阔基' },
            { season: '37-38', kind: '世冠', team: '极道' },
            { season: '37-38', kind: '联赛', league: '华超', team: '刀枪剑戟' },
            { season: '37-38', kind: '联赛', league: '锐超', team: '雷动' },
            { season: '37-38', kind: '联赛', league: '枫超', team: '风车郡' },
            { season: '37-38', kind: '联赛', league: '晴甲', team: '终末静音' },
            { season: '37-38', kind: '联赛', league: '辙甲', team: '赫洛沃德' },
            { season: '37-38', kind: '杯赛', league: '华超', team: '极道' },
            { season: '37-38', kind: '杯赛', league: '锐超', team: '川流' },
            { season: '37-38', kind: '杯赛', league: '枫超', team: '风车郡' },
            { season: '37-38', kind: '杯赛', league: '晴甲', team: '终末静音' },
            { season: '37-38', kind: '杯赛', league: '辙甲', team: '阔基' },
            { season: '38-39', kind: '世冠', team: '极道' },
            { season: '38-39', kind: '联赛', league: '华超', team: '烬' },
            { season: '38-39', kind: '联赛', league: '锐超', team: '火燃' },
            { season: '38-39', kind: '联赛', league: '枫超', team: '沃斯维尔' },
            { season: '38-39', kind: '联赛', league: '晴甲', team: '传奇长歌' },
            { season: '38-39', kind: '联赛', league: '辙甲', team: 'OTR' },
            { season: '38-39', kind: '杯赛', league: '华超', team: '刀枪剑戟' },
            { season: '38-39', kind: '杯赛', league: '锐超', team: '川流' },
            { season: '38-39', kind: '杯赛', league: '枫超', team: '沃斯维尔' },
            { season: '38-39', kind: '杯赛', league: '晴甲', team: '传奇长歌' },
            { season: '38-39', kind: '杯赛', league: '辙甲', team: 'OTR' }
    ];

    var SAMPLE = [
        {
            slug: 'jidao-fourth-world-title',
            date: '2038-06-15',
            league: '华超',
            tag: '世冠',
            author: '特约记者 · 林深',
            hero: true,
            title: '极道加冕队史第四冠',
            summary: '在刚刚结束的世冠决赛中，极道以 3-1 击败临淇，队史第四座世冠奖杯入账。这支队伍在过去五个赛季里三次杀入决赛，终于在这一年完成登顶。',
            body: '在刚刚结束的世冠决赛中，极道以 3-1 击败临淇，队史第四座世冠奖杯入账。\n\n决赛的转折点出现在第 34 分钟。极道在中场完成一次干净的三脚传递后由边路内切打入死角，把场面彻底掰向自己一侧。临淇此后两度通过定位球施压，但都没能越过极道门将的十指关。\n\n这支队伍在过去五个赛季里三次杀入决赛，两次倒在最后一步。主教练在赛后发布会上只说了一句话："我们把该等的年份等完了。"\n\n随着这座奖杯入账，极道的世冠数量来到四座，在历代冠军榜上仅次于沃斯维尔。而临淇仍然停留在 1 座，他们的窗口期，看上去正在收窄。'
        },
        {
            slug: 'lieta-qizhen-cup',
            date: '2038-05-20',
            league: '辙甲',
            tag: '杯赛',
            author: '',
            hero: false,
            title: '猎塔夺启真杯，辙甲新王登基',
            summary: '启真杯决赛，猎塔 2-0 击败阔基，队史首座杯赛奖杯。',
            body: '启真杯决赛，猎塔 2-0 击败阔基，队史首座杯赛奖杯。\n\n两个进球都来自下半场。猎塔在下半场开场十分钟内连入两球，把此前一直僵持的比赛直接拉开。阔基全场控球占优，但射正次数只有两次。\n\n这是辙甲球队连续第三年在启真杯决赛中取胜，也是猎塔建队以来第一次捧起奖杯。'
        },
        {
            slug: 'vosville-nine-titles-end',
            date: '2037-09-10',
            league: '枫超',
            tag: '联赛',
            author: '',
            hero: false,
            title: '沃斯维尔九冠王朝终结',
            summary: '枫超联赛收官，沃斯维尔未能卫冕，九冠王朝止步于此。',
            body: '枫超联赛收官，沃斯维尔未能卫冕，九冠王朝止步于此。\n\n整个赛季沃斯维尔都在追赶，但收官阶段的一波三连平彻底断送了希望。最终他们以两分之差位居次席，九座联赛冠军的纪录停在原地。\n\n这支队伍上一次丢掉联赛冠军，已经是九个赛季之前的事。'
        },
        {
            slug: 'leidong-fourth-league-title',
            date: '2036-06-08',
            league: '锐超',
            tag: '联赛',
            author: '',
            hero: false,
            title: '雷动四冠，锐超统治力再现',
            summary: '雷动以 3-1 击败石韵，夺得队史第四座联赛冠军。',
            body: '雷动以 3-1 击败石韵，夺得队史第四座联赛冠军。\n\n决定冠军归属的那场比赛，雷动在上半场就建立了两球优势。石韵下半场扳回一城，但雷动在补时阶段再入一球锁定胜局。\n\n四座联赛冠军让雷动成为锐超历史上夺冠次数最多的球队。'
        },
        {
            slug: 'legend-changge-second-world-title',
            date: '2036-05-22',
            league: '晴甲',
            tag: '世冠',
            author: '',
            hero: false,
            title: '传奇长歌再夺世冠',
            summary: '晴甲劲旅传奇长歌在世冠决赛中击败北港FC，队史第二座世冠。',
            body: '晴甲劲旅传奇长歌在世冠决赛中击败北港FC，队史第二座世冠。\n\n比赛被拖入加时，传奇长歌在加时赛下半场抓住对方后卫的一次失误完成致命一击。北港FC全场射门数更多，但始终没能把握住机会。\n\n这是晴甲球队第二次拿到世冠奖杯，两次都由传奇长歌完成。'
        },
        {
            slug: 'changge-fc-first-league-title',
            date: '2035-09-14',
            league: '晴甲',
            tag: '联赛',
            author: '',
            hero: false,
            title: '长歌FC首夺联赛冠军',
            summary: '晴甲联赛收官，长歌FC 首次登顶，终结了多年陪跑历史。',
            body: '晴甲联赛收官，长歌FC 首次登顶，终结了多年陪跑历史。\n\n他们在最后一轮只需要一场平局，最终以 2-0 干净利落地拿下比赛。此前五个赛季，长歌FC 四次进入前三，却始终与冠军擦肩而过。\n\n夺冠当天，球队宣布下赛季将继续保留全部主力阵容。'
        }
    ];

    /* =================================================================
       ③ Supabase 查询（直接走 REST，不需要引入 SDK）
       ================================================================= */
    function headers() {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Accept': 'application/json'
        };
    }

    function restUrl(query) {
        return SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + TABLE + '?' + query;
    }

    /* 按日期倒序取列表 */
    function fetchList() {
        var url = restUrl(
            'select=*&order=date.desc&limit=' + LIST_LIMIT
        );
        return fetch(url, { headers: headers() }).then(function (res) {
            if (!res.ok) throw new Error('Supabase ' + res.status + ' ' + res.statusText);
            return res.json();
        }).then(function (rows) {
            if (!Array.isArray(rows)) throw new Error('返回格式不是数组');
            currentSource = 'supabase';
            return rows;
        });
    }

    /* -----------------------------------------------------------------
       冠军记录（titles 表）
       -----------------------------------------------------------------
       取回来的是原始记录，排名由 stats.js 在前端实时统计。
       ----------------------------------------------------------------- */
    var TITLES_TABLE = 'titles';
    var titlesCache = null;

    function fetchTitles() {
        var base = SUPABASE_URL.replace(/\/+$/, '');
        var url = base + '/rest/v1/' + TITLES_TABLE +
                  '?select=season,kind,league,team&order=season.desc&limit=2000';
        /* 用 new Promise 包一层：这样即便 fetch 本身同步抛错
           （环境没有 fetch、或请求被浏览器拦截），也会变成 rejected promise
           被上层的 .catch 接住并退回兜底数据，而不是直接崩掉页面。 */
        return new Promise(function (resolve, reject) {
            fetch(url, { headers: headers() }).then(resolve, reject);
        }).then(function (res) {
            if (!res.ok) throw new Error('Supabase ' + res.status + ' ' + res.statusText);
            return res.json();
        }).then(function (rows) {
            if (!Array.isArray(rows)) throw new Error('返回格式不是数组');
            titlesSource = 'supabase';
            return rows;
        });
    }

    /* -----------------------------------------------------------------
       球队助威值（第二个项目的 teams 表）
       -----------------------------------------------------------------
       返回按 id 升序排列的球队数组；取不到则返回空数组，
       让上层退回"按冠军数计算热度"的口径。
       ----------------------------------------------------------------- */
    function fetchTeams() {
        var base = CHEER_URL.replace(/\/+$/, '');
        var url = base + '/rest/v1/' + CHEER_TABLE +
                  '?select=id,name,votes&order=id.asc&limit=500';
        var headers = {
            'apikey': CHEER_KEY,
            'Authorization': 'Bearer ' + CHEER_KEY,
            'Accept': 'application/json'
        };
        return new Promise(function (resolve, reject) {
            fetch(url, { headers: headers }).then(resolve, reject);
        }).then(function (res) {
            if (!res.ok) throw new Error('Supabase ' + res.status + ' ' + res.statusText);
            return res.json();
        }).then(function (rows) {
            if (!Array.isArray(rows)) throw new Error('返回格式不是数组');
            /* id 是文本类型，按数值排序才能得到 1,2,…,10,11 而不是 1,10,11,2 */
            rows.sort(function (a, b) {
                return (Number(a.id) || 0) - (Number(b.id) || 0);
            });
            cheerSource = 'supabase';
            return rows;
        });
    }

    /* 取单篇：先按 slug，再退回按 id（兼容用数字主键的表） */
    function fetchOne(slug) {
        var enc = encodeURIComponent(slug);
        function one(query) {
            return fetch(restUrl(query), { headers: headers() }).then(function (res) {
                if (!res.ok) throw new Error('Supabase ' + res.status + ' ' + res.statusText);
                return res.json();
            }).then(function (rows) {
                return Array.isArray(rows) && rows.length ? rows[0] : null;
            });
        }
        return one('select=*&slug=eq.' + enc + '&limit=1').then(function (row) {
            if (row) return row;
            if (/^\d+$/.test(slug)) {
                return one('select=*&id=eq.' + enc + '&limit=1');
            }
            return null;
        });
    }

    /* 网络失敗 / 未配置 / 查询出错 → 都退回内置数据，页面不会白屏 */
    function fallbackList() {
        currentSource = 'fallback';
        return SAMPLE.slice().sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date));
        });
    }

    function fallbackOne(slug) {
        currentSource = 'fallback';
        var found = null;
        for (var i = 0; i < SAMPLE.length; i++) {
            if (SAMPLE[i].slug === slug) { found = SAMPLE[i]; break; }
        }
        return found;
    }

    function fallbackTitles() {
        titlesSource = 'fallback';
        return SAMPLE_TITLES.slice();
    }

    /* =================================================================
       ④ 对外接口
       ================================================================= */
    var api = {
        /* 列表：首页用。永远返回一个按日期倒序的数组 */
        listArticles: function () {
            if (!configured) return Promise.resolve(fallbackList());
            if (listCache) return Promise.resolve(listCache);
            return fetchList().then(function (rows) {
                if (!rows.length) throw new Error('表里还没有数据');
                listCache = rows;
                return rows;
            }).catch(function () {
                return fallbackList();
            });
        },

        /* 单篇：详情页用。找不到返回 null */
        getArticle: function (slug) {
            if (!slug) return Promise.resolve(null);
            if (!configured) return Promise.resolve(fallbackOne(slug));

            /* 已经拉过列表就直接在里面找，省一次请求 */
            if (listCache) {
                var hit = null;
                for (var i = 0; i < listCache.length; i++) {
                    if (listCache[i].slug === slug) { hit = listCache[i]; break; }
                }
                if (hit) return Promise.resolve(hit);
            }

            return fetchOne(slug).then(function (row) {
                return row || fallbackOne(slug);
            }).catch(function () {
                return fallbackOne(slug);
            });
        },

        /* 当前数据来源，用于页面上提示"是否连上数据库" */
        source: function () { return currentSource; },
        isConfigured: function () { return configured; },

        /* -----------------------------------------------------------------
           冠军记录：右栏的排名、近期夺冠、热度都由它实时统计
           -----------------------------------------------------------------
           永远返回一个数组；读不到数据库时退回内置的 158 条真实记录。
           ----------------------------------------------------------------- */
        listTitles: function () {
            if (!configured) return Promise.resolve(fallbackTitles());
            if (titlesCache) return Promise.resolve(titlesCache);
            return fetchTitles().then(function (rows) {
                if (!rows.length) throw new Error('titles 表还没有数据');
                titlesCache = rows;
                return rows;
            }).catch(function () {
                return fallbackTitles();
            });
        },

        /* 冠军数据的来源，用于页面提示 */
        titlesSource: function () { return titlesSource; },

        /* -----------------------------------------------------------------
           球队助威值：右栏「联赛热度」与左栏「总助威」都用它
           -----------------------------------------------------------------
           按 id 升序，每 8 支球队归入一个联赛（华超→辙甲）。
           永远返回一个数组；取不到就是空数组，调用方自行兜底。
           ----------------------------------------------------------------- */
        listTeams: function () {
            if (!cheerConfigured) return Promise.resolve([]);
            if (teamsCache) return Promise.resolve(teamsCache);
            return fetchTeams().then(function (rows) {
                teamsCache = rows;
                return rows;
            }).catch(function () {
                cheerSource = 'fallback';
                return [];
            });
        },

        /* 助威数据的来源，用于页面提示 */
        cheerSource: function () { return cheerSource; },

        /* 按联赛汇总助威：返回 [{league, votes, teams, pct}]，无数据时为空数组 */
        leagueCheers: function () {
            var api = this;
            return api.listTeams().then(function (teams) {
                if (!teams.length) return [];
                var buckets = {};
                var total = 0;
                teams.forEach(function (t, i) {
                    var li = Math.floor(i / TEAMS_PER_LEAGUE);
                    var lg = LEAGUE_NAMES[li];
                    if (!lg) return;   /* 超出五个联赛的队伍忽略 */
                    var v = Number(t.votes) || 0;
                    buckets[lg] = buckets[lg] || { league: lg, votes: 0, teams: 0 };
                    buckets[lg].votes += v;
                    buckets[lg].teams += 1;
                    total += v;
                });
                return LEAGUE_NAMES.filter(function (lg) { return buckets[lg]; }).map(function (lg) {
                    var b = buckets[lg];
                    return {
                        league: lg,
                        votes: b.votes,
                        teams: b.teams,
                        pct: total ? Math.round(b.votes / total * 100) : 0
                    };
                });
            });
        },

        /* 助威总和（左栏"总助威"用） */
        totalCheers: function () {
            return this.listTeams().then(function (teams) {
                return teams.reduce(function (a, t) { return a + (Number(t.votes) || 0); }, 0);
            });
        },

        /* 项目地址（不含密钥），供本地发稿台等工具复用同一份配置 */
        projectUrl: function () { return SUPABASE_URL.replace(/\/+$/, ''); },

        /* 供后台/脚本复用 */
        _sample: SAMPLE
    };

    global.VLA = api;
})(window);
