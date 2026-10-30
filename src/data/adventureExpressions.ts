/** 原创迁移表达：在新情境中补全一个短语，仅核对明确列出的可接受写法。 */
export interface AdventureExpression {
  id: string
  sceneId: string
  prompt: string
  before: string
  after: string
  acceptedAnswers: string[]
  referenceAnswer: string
  hint: string
  explanation: string
}

export const ADVENTURE_EXPRESSIONS: AdventureExpression[] = [
  {
    id: 'campus-library-say-1', sceneId: 'campus-library',
    prompt: '换到社团活动中心：你想礼貌预约周六的讨论室。',
    before: 'Could I ', after: ' a discussion room for Saturday?',
    acceptedAnswers: ['reserve', 'book'], referenceAnswer: 'reserve',
    hint: '想想“预先留好一个房间”的动词；这里不是借走物品。',
    explanation: 'Could I reserve a room…? 是礼貌预约房间的说法。book 也能表示“预订”；for Saturday 交代预约日期。',
  },
  {
    id: 'campus-library-say-2', sceneId: 'campus-library',
    prompt: '你现在负责资料台：请同学周五前把词典归还到这里。',
    before: 'Please ', after: ' the dictionary to this desk by Friday.',
    acceptedAnswers: ['return', 'bring back'], referenceAnswer: 'return',
    hint: '需要表示“归还”或“带回来”，不是再次借走。',
    explanation: 'return the dictionary 和 bring back the dictionary 都能表达归还。by Friday 表示最迟周五；不要用 borrow 表达还书。',
  },
  {
    id: 'campus-project-say-1', sceneId: 'campus-project',
    prompt: '新任务是测试校园活动报名表：请志愿者指出看不懂的地方。',
    before: 'Could you ', after: ' us know if any part of the form is unclear?',
    acceptedAnswers: ['let', 'please let'], referenceAnswer: 'let',
    hint: '用“让我们知道”的固定表达，空白后已经有 us know。',
    explanation: 'let someone know 表示“让某人知道”。Could you please let us know…? 也成立；if 引出“如果有不清楚的部分”。',
  },
  {
    id: 'campus-project-say-2', sceneId: 'campus-project',
    prompt: '你为读书社设计了反馈表，建议正式发布前先找几人试用。',
    before: "Let's ask a few volunteers to ", after: ' the feedback form before we share it.',
    acceptedAnswers: ['try', 'try out', 'test'], referenceAnswer: 'try out',
    hint: 'to 后用动词原形，表达“试用、测试”。',
    explanation: 'try out the form 强调先试用；try 和 test 在这里也合适。before we share it 说明先小范围测试，再正式发布。',
  },
  {
    id: 'campus-seminar-say-1', sceneId: 'campus-seminar',
    prompt: '两份阅读调查的数字不同。讨论前，你建议先核查它们的统计定义。',
    before: 'We should ', after: ' the definitions before comparing these figures.',
    acceptedAnswers: ['check', 'review', 'compare', 'examine'], referenceAnswer: 'check',
    hint: 'should 后接动词原形；先弄清每个数字到底统计了什么。',
    explanation: 'check 或 review the definitions 表示核查统计口径；compare 和 examine 也适合这个语境。不能只根据数字大小就断定一方错误。',
  },
  {
    id: 'campus-seminar-say-2', sceneId: 'campus-seminar',
    prompt: '一项调查统计每天阅读的人，另一项统计每月阅读的人。说明两组结果不能直接比较。',
    before: 'These results are not ', after: ' because they measure different things.',
    acceptedAnswers: ['directly comparable', 'comparable'], referenceAnswer: 'directly comparable',
    hint: '空白需要形容词表达“可比较的”；可加副词强调“直接”。',
    explanation: 'not directly comparable 表示“不能直接比较”，准确指出比较的限制。comparable 本身也成立，但直接比较的限定更谨慎、更具体。',
  },
  {
    id: 'city-museum-say-1', sceneId: 'city-museum',
    prompt: '这次你要坐公交去科学馆。向司机询问应在哪一站下车。',
    before: 'Which stop should I ', after: ' at for the science centre?',
    acceptedAnswers: ['get off', 'get off the bus'], referenceAnswer: 'get off',
    hint: '公交车“下车”用一个含 off 的短语。',
    explanation: 'get off 表示下车，at 引出站点。get off the bus 也正确；get on 表示上车，方向正好相反。',
  },
  {
    id: 'city-museum-say-2', sceneId: 'city-museum',
    prompt: '你到了陌生的街区，礼貌询问最近的美术馆在哪里。',
    before: 'Could you tell me ', after: ' the nearest gallery is?',
    acceptedAnswers: ['where', 'where exactly'], referenceAnswer: 'where',
    hint: '询问地点；tell me 后使用间接问句，已有的语序不用改。',
    explanation: 'Could you tell me where the nearest gallery is? 是礼貌问路的间接问句。where 后保持陈述语序；where exactly 可以进一步询问具体位置。',
  },
  {
    id: 'city-guesthouse-say-1', sceneId: 'city-guesthouse',
    prompt: '你预订了另一家小旅馆，担心认错入口，请房东发张入口照片。',
    before: 'Could you ', after: ' me a photo of the entrance?',
    acceptedAnswers: ['send', 'email'], referenceAnswer: 'send',
    hint: '需要一个“发送”的动词；如果明确用邮件发送，也可以。',
    explanation: 'send someone a photo 表示给某人发照片；email me a photo 则明确通过邮件发送。Could you…? 让请求更礼貌。',
  },
  {
    id: 'city-guesthouse-say-2', sceneId: 'city-guesthouse',
    prompt: '房东将发送自助入住说明，你承诺收到消息后立刻告知。',
    before: 'I will ', after: ' as soon as I receive the message.',
    acceptedAnswers: ['let you know', 'confirm receipt', 'get back to you'], referenceAnswer: 'let you know',
    hint: '用一个短语表示“通知你、确认收到或给你回复”。',
    explanation: 'let you know 是常用的“告诉你”；confirm receipt 更正式，表示确认收到；get back to you 表示回复。as soon as 后用现在时 receive 表达未来的时间。',
  },
  {
    id: 'city-riverside-say-1', sceneId: 'city-riverside',
    prompt: '在另一处湿地旅行时，你向导游表达希望选择避开鸟类筑巢区的路线。',
    before: "I'd ", after: ' a route that avoids the nesting area.',
    acceptedAnswers: ['prefer', 'like'], referenceAnswer: 'prefer',
    hint: "I'd 是 I would 的缩写；后接表示偏好或希望的动词。",
    explanation: "I'd prefer a route… 表示更倾向选择某条路线；I'd like a route… 表示希望选择。that avoids… 清楚说明路线需要避开筑巢区域。",
  },
  {
    id: 'city-riverside-say-2', sceneId: 'city-riverside',
    prompt: '你认可湿地导览方案，但报名之前想先问费用。',
    before: 'Could you tell me ', after: ' the guided walk costs?',
    acceptedAnswers: ['how much', 'roughly how much', 'approximately how much'], referenceAnswer: 'how much',
    hint: '询问金额；如果只想先知道大致价格，可以加“约”的副词。',
    explanation: 'how much 用来询问费用。roughly 或 approximately 表示“大约”；间接问句中保持 the guided walk costs 的陈述语序。',
  },
  {
    id: 'work-first-day-say-1', sceneId: 'work-first-day',
    prompt: '下午的培训需要电脑，你向同事礼貌借用他的笔记本。',
    before: 'Could I ', after: ' your laptop for the afternoon workshop?',
    acceptedAnswers: ['borrow', 'use'], referenceAnswer: 'borrow',
    hint: '想想“向别人借来”或“使用”的动词，别把借入和借出混淆。',
    explanation: 'Could I borrow your laptop…? 是请求借用；use 也适合这里。lend 表示借出，主语是出借的人，不能直接替换此处的 borrow。',
  },
  {
    id: 'work-first-day-say-2', sceneId: 'work-first-day',
    prompt: '在新的培训室里，你不会接屏幕，请同事演示连接方法。',
    before: 'Could you show me ', after: ' the screen?',
    acceptedAnswers: ['how to connect', 'how I can connect'], referenceAnswer: 'how to connect',
    hint: '用“如何＋连接”的结构；也可以用一个简短的间接问句。',
    explanation: 'show me how to connect… 表示演示连接方法。how I can connect… 也成立；两种说法都明确请求对方教你操作，而不只是帮你接好。',
  },
  {
    id: 'work-deadline-say-1', sceneId: 'work-deadline',
    prompt: '你负责活动预算，数据还未核实。说明十点前会发送的只是初稿。',
    before: "I'll send the ", after: ' by ten, but it may still change.',
    acceptedAnswers: ['draft', 'preliminary version', 'initial version', 'first draft'], referenceAnswer: 'draft',
    hint: '需要一个名词或名词短语，表明这份文件还不是最终版本。',
    explanation: 'draft 是草稿；preliminary version、initial version 和 first draft 都能标明初步状态。but it may still change 提醒对方内容仍可能更新。',
  },
  {
    id: 'work-deadline-say-2', sceneId: 'work-deadline',
    prompt: '你现在负责项目协调，请组员一旦数据延迟就及时通知你。',
    before: 'Please ', after: ' if the updated figures are delayed.',
    acceptedAnswers: ['let me know', 'tell me', 'notify me', 'inform me'], referenceAnswer: 'let me know',
    hint: '这是请对方“告知我”的请求，空白中要包含接收通知的人。',
    explanation: 'Please let me know if… 是常用的反馈请求；tell me、notify me 和 inform me 在这里也成立。if 说明需要通知的情况。',
  },
  {
    id: 'work-hybrid-say-1', sceneId: 'work-hybrid',
    prompt: '团队想调整弹性工作时间，你建议先试行三周，再决定是否长期采用。',
    before: "Let's ", after: ' for three weeks before making a permanent change.',
    acceptedAnswers: ['run a pilot', 'run a trial', 'try it', 'test it out'], referenceAnswer: 'run a pilot',
    hint: '需要一个表示“先试行”的动词短语；这里的 pilot 不是飞行员。',
    explanation: 'run a pilot 和 run a trial 都表示开展试行；try it 和 test it out 更口语化。限定三周并在之后决定，能把试行和永久改变区分开。',
  },
  {
    id: 'work-hybrid-say-2', sceneId: 'work-hybrid',
    prompt: '弹性工作试行结束，建议把项目结果和团队反馈都纳入考虑。',
    before: 'We should ', after: ' both project results and team feedback.',
    acceptedAnswers: ['take into account', 'consider', 'review', 'look at'], referenceAnswer: 'take into account',
    hint: '用表示“考虑、审视”的动词或短语；both…and… 已经列出了两方面信息。',
    explanation: 'take into account 表示把信息纳入考虑；consider、review 和 look at 在这里也能表达审视两类依据。both…and… 强调两方面都要兼顾。',
  },
]

export function getSceneExpressions(sceneId: string): AdventureExpression[] {
  return ADVENTURE_EXPRESSIONS.filter((expression) => expression.sceneId === sceneId)
}
