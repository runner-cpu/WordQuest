/**
 * 内置听力材料（原创脚本）
 *
 * 随站提供英语合成录音；初次播放后按需缓存，无需安装浏览器语音包。
 * 真题听力另有高校公开整理的原卷录音，素材来源与用途分别标注。
 */

export interface BuiltinSentence {
  text: string
  zh: string
}

export interface BuiltinMaterial {
  id: string
  title: string
  topic: string
  /** 难度标签，对应 CEFR */
  level: 'A2' | 'B1' | 'B2'
  /** 建议练习方式 */
  hint: string
  sentences: BuiltinSentence[]
}

export const BUILTIN_MATERIALS: BuiltinMaterial[] = [
  {
    id: 'campus-first-week',
    title: '大学第一周',
    topic: '校园生活',
    level: 'A2',
    hint: '语速平稳，适合入门听写',
    sentences: [
      { text: 'The first week of university is always busy.', zh: '大学的第一周总是很忙。' },
      { text: 'Students need to find their classrooms and buy books.', zh: '学生需要找到教室并买书。' },
      { text: 'Many of them are living away from home for the first time.', zh: '他们中的许多人第一次离家生活。' },
      { text: 'The library stays open until midnight during the first month.', zh: '第一个月里图书馆开放到午夜。' },
      { text: 'New students often join clubs to make friends.', zh: '新生常常加入社团来交朋友。' },
      { text: 'Some of them feel nervous, but most become comfortable soon.', zh: '有些人感到紧张，但大多数人很快就能适应。' },
      { text: 'A good plan can make the whole term much easier.', zh: '一个好的计划能让整个学期轻松很多。' },
    ],
  },
  {
    id: 'tech-smartphone',
    title: '我们如何使用手机',
    topic: '科技',
    level: 'B1',
    hint: '含数字与转折，注意连读',
    sentences: [
      { text: 'The average person checks a smartphone about eighty times a day.', zh: '普通人每天大约查看手机八十次。' },
      { text: 'That number has grown quickly over the past ten years.', zh: '这个数字在过去十年里增长得很快。' },
      { text: 'Smartphones help us find information and stay in touch.', zh: '手机帮助我们查找信息并保持联系。' },
      { text: 'However, they can also take our attention away from work.', zh: '然而，它们也会把我们的注意力从工作中带走。' },
      { text: 'Some people turn off notifications while they study.', zh: '有些人在学习时会关闭通知。' },
      { text: 'Others keep the phone in another room to avoid checking it.', zh: '另一些人把手机放在另一个房间以避免查看。' },
      { text: 'A simple rule is to finish one task before picking it up again.', zh: '一个简单的规则是完成一项任务后再拿起手机。' },
    ],
  },
  {
    id: 'env-plastic',
    title: '海洋里的塑料',
    topic: '环境',
    level: 'B1',
    hint: '注意被动语态与数量表达',
    sentences: [
      { text: 'Millions of tons of plastic end up in the ocean every year.', zh: '每年有数百万吨塑料最终进入海洋。' },
      { text: 'Some of it floats on the surface, and some sinks to the bottom.', zh: '其中一些漂浮在水面，一些沉入海底。' },
      { text: 'Small pieces are often eaten by fish and birds.', zh: '小碎片常被鱼类和鸟类吃掉。' },
      { text: 'Scientists are trying to measure how serious the problem is.', zh: '科学家们正试图衡量这个问题有多严重。' },
      { text: 'Several countries have banned single-use plastic bags.', zh: '一些国家已经禁止使用一次性塑料袋。' },
      { text: 'Recycling is important, but using less plastic matters more.', zh: '回收很重要，但少用塑料更重要。' },
      { text: 'Every small choice can reduce the waste we produce.', zh: '每一个小选择都能减少我们产生的垃圾。' },
    ],
  },
  {
    id: 'health-sleep',
    title: '睡眠与记忆',
    topic: '健康',
    level: 'B1',
    hint: '适合练习因果关系的听辨',
    sentences: [
      { text: 'Sleep plays an important role in learning and memory.', zh: '睡眠在学习和记忆中起着重要作用。' },
      { text: 'During deep sleep, the brain organizes what we learned during the day.', zh: '在深度睡眠中，大脑会整理我们白天学到的东西。' },
      { text: 'Students who sleep well often remember more in exams.', zh: '睡眠好的学生在考试中往往记得更多。' },
      { text: 'Staying up late before a test usually does more harm than good.', zh: '考试前熬夜通常弊大于利。' },
      { text: 'Experts suggest keeping the same bedtime every night.', zh: '专家建议每晚保持相同的就寝时间。' },
      { text: 'They also advise avoiding bright screens for an hour before sleep.', zh: '他们还建议睡前一小时避免明亮的屏幕。' },
      { text: 'A short walk in the evening can help the body relax.', zh: '傍晚散步有助于身体放松。' },
    ],
  },
  {
    id: 'culture-spring-festival',
    title: '春节',
    topic: '文化',
    level: 'A2',
    hint: '专有名词较多，先听后写',
    sentences: [
      { text: 'The Spring Festival is the most important holiday in China.', zh: '春节是中国最重要的节日。' },
      { text: 'Families travel long distances to be together.', zh: '家人会长途跋涉团聚。' },
      { text: 'People clean their homes and put up red decorations.', zh: '人们打扫房屋并挂上红色装饰。' },
      { text: 'On the evening before the new year, families share a big dinner.', zh: '除夕夜，家人一起吃一顿丰盛的晚餐。' },
      { text: 'Children receive red envelopes with money inside.', zh: '孩子们会收到装有压岁钱的红包。' },
      { text: 'Fireworks are less common in big cities now.', zh: '如今大城市里放烟花已不那么常见。' },
      { text: 'The holiday usually lasts about a week.', zh: '这个假期通常持续一周左右。' },
    ],
  },
  {
    id: 'travel-mountains',
    title: '山中旅行',
    topic: '旅行',
    level: 'A2',
    hint: '方位与时间表达较多',
    sentences: [
      { text: 'Last summer, my friends and I climbed a mountain in the north.', zh: '去年夏天，我和朋友们爬了北方的一座山。' },
      { text: 'We started early in the morning before the sun was high.', zh: '我们一大早就出发，那时太阳还不高。' },
      { text: 'The path was narrow, and the stones were wet from the rain.', zh: '小路很窄，石头被雨打湿了。' },
      { text: 'After two hours, we reached a small lake near the top.', zh: '两小时后，我们到达了山顶附近的一个小湖。' },
      { text: 'The water was clear enough to see the bottom.', zh: '水清澈得能看到水底。' },
      { text: 'We rested there and ate the food we had brought.', zh: '我们在那里休息，吃了带来的食物。' },
      { text: 'It was a tiring day, but the view made it worth it.', zh: '那天很累，但风景让一切都值得。' },
    ],
  },
  {
    id: 'work-remote',
    title: '在家办公',
    topic: '工作',
    level: 'B1',
    hint: '对比结构，注意 however 后的转折',
    sentences: [
      { text: 'More people work from home today than ever before.', zh: '如今在家办公的人比以往任何时候都多。' },
      { text: 'Remote work saves time that used to be spent on the road.', zh: '远程办公节省了过去花在路上的时间。' },
      { text: 'It also gives workers more control over their schedule.', zh: '它也让员工对自己的时间安排有更多掌控。' },
      { text: 'However, working alone can make people feel isolated.', zh: '然而，独自工作会让人感到孤立。' },
      { text: 'Some teams meet online every morning to stay connected.', zh: '一些团队每天早上在线开会以保持联系。' },
      { text: 'Others set aside one day a week for office meetings.', zh: '另一些团队每周留出一天用于办公室会议。' },
      { text: 'The best arrangement often depends on the kind of work.', zh: '最好的安排往往取决于工作的类型。' },
    ],
  },
  {
    id: 'education-language',
    title: '如何学一门语言',
    topic: '教育',
    level: 'B1',
    hint: '建议句型较多，注意情态动词',
    sentences: [
      { text: 'Learning a language takes time, and progress is not always steady.', zh: '学习一门语言需要时间，进步也不总是平稳的。' },
      { text: 'Many learners spend too much time reading and too little time listening.', zh: '许多学习者花太多时间阅读，听的时间却太少。' },
      { text: 'Listening helps you notice how words are actually pronounced.', zh: '听能帮助你注意到单词实际是怎么发音的。' },
      { text: 'It is better to practice a little every day than a lot once a week.', zh: '每天练一点比每周练一次要好。' },
      { text: 'Keep a record of the words you often forget.', zh: '记录下你经常忘记的单词。' },
      { text: 'Review them at increasing intervals until they stay in memory.', zh: '以递增的间隔复习它们，直到记住为止。' },
      { text: 'Speaking with other people is the fastest way to improve.', zh: '与别人交流是提高最快的方法。' },
    ],
  },
  {
    id: 'science-water',
    title: '水循环',
    topic: '科学',
    level: 'B1',
    hint: '流程描述，注意顺序词',
    sentences: [
      { text: 'Water moves through the environment in a continuous cycle.', zh: '水在环境中以持续的循环运动。' },
      { text: 'Heat from the sun turns water on the surface into vapor.', zh: '太阳的热量把地表的水变成水蒸气。' },
      { text: 'The vapor rises and cools, forming tiny drops in the air.', zh: '水蒸气上升并冷却，在空气中形成小水滴。' },
      { text: 'These drops gather into clouds and move with the wind.', zh: '这些水滴聚集成云，随风移动。' },
      { text: 'When the drops become heavy enough, they fall as rain or snow.', zh: '当水滴变得足够重时，就会以雨或雪的形式落下。' },
      { text: 'Some of the water flows into rivers and returns to the sea.', zh: '一部分水流入河流并回到大海。' },
      { text: 'The rest goes into the ground and is stored for years.', zh: '其余的水进入地下并储存多年。' },
    ],
  },
  {
    id: 'society-volunteer',
    title: '社区志愿',
    topic: '社会',
    level: 'A2',
    hint: '短句为主，适合连续听写',
    sentences: [
      { text: 'Every Saturday, a group of students volunteers at the community center.', zh: '每周六，一群学生在社区中心做志愿者。' },
      { text: 'They help older people carry heavy bags and clean their rooms.', zh: '他们帮助老人搬重物、打扫房间。' },
      { text: 'Some of them teach children how to use a computer.', zh: '其中一些人教孩子如何使用电脑。' },
      { text: 'The center also provides free meals on cold days.', zh: '中心在寒冷的日子还提供免费餐食。' },
      { text: 'Volunteers say they learn more than they give.', zh: '志愿者说他们学到的比给予的更多。' },
      { text: 'One student said the experience changed how she saw her city.', zh: '一名学生说这段经历改变了她对自己城市的看法。' },
      { text: 'New members are always welcome.', zh: '新成员总是受欢迎的。' },
    ],
  },
]

export function builtinMaterialById(id: string): BuiltinMaterial | undefined {
  return BUILTIN_MATERIALS.find((m) => m.id === id)
}
