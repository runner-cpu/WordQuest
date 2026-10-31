/**
 * 内置原创听力短练，按主题与学习目标分组。
 * 每组包含三段材料和 7–8 道选择题，随站提供英语合成录音。
 * 材料顺序不对应官方考试分区，题目未经考试难度或分数校准。
 * 稳定 id 保留旧值，供已有练习与备份引用。
 */
import type { ExamItem, ExamPack } from '../core/examImport'

const g = (pack: string, n: number) => `${pack}-g${n}`

/** 每个 group 对应一段实际材料。 */
const RAW_PACKS: ExamPack[] = [
  {
    id: 'sim-cet4-campus',
    title: '校园与科技 · 原创短练',
    level: 'CET-4',
    sectionName: '原创听力短练',
    items: [
      {
        group: g('a', 1),
        stem:
          'A university in the Netherlands has replaced its bicycle parking lot with a "green roof" that collects rainwater. The roof, covered with grass and small plants, can hold up to forty thousand liters of water during heavy storms. University officials say the project will reduce flooding in the area and provide a quiet place for students to relax. The city plans to build two more green roofs next year.',
        question: 'What is the main purpose of the green roof?',
        options: [
          'To collect rainwater and reduce flooding.',
          'To grow vegetables for the university.',
          'To provide more parking spaces for bicycles.',
          'To attract tourists to the city.',
        ],
        answer: 0,
        explain: '原文第一句点明收集雨水（collect rainwater），后文补充减少洪水（reduce flooding）。',
      },
      {
        group: g('a', 1),
        stem: '',
        question: 'How many liters of water can the roof hold during storms?',
        options: ['Four thousand.', 'Forty thousand.', 'Fourteen thousand.', 'Four hundred.'],
        answer: 1,
        explain: '原文说 up to forty thousand liters，注意区分 forty thousand 与干扰项的相近数字。',
      },
      {
        group: g('a', 1),
        stem: '',
        question: 'What will the city do next year?',
        options: [
          'Close the university parking lot.',
          'Build two more green roofs.',
          'Plant trees along the streets.',
          'Open a new bicycle shop.',
        ],
        answer: 1,
        explain: '最后一句 The city plans to build two more green roofs next year。',
      },
      {
        group: g('b', 1),
        stem:
          'M: Hi Lisa, I heard the library will stay open until midnight during the exam weeks.\nW: Really? That is great news. But is the coffee shop inside the library also open that late?\nM: I am not sure. Last year it closed at ten. Maybe we should bring our own coffee.\nW: Good idea. By the way, do you know if the group study rooms can be booked online now?\nM: Yes, they changed the system last month. You can reserve a room for up to three hours.',
        question: 'What are the speakers mainly talking about?',
        options: [
          'How to prepare for exams.',
          'Library services during exam weeks.',
          'Where to buy coffee on campus.',
          'How to apply for a student card.',
        ],
        answer: 1,
        explain: '对话围绕考试周图书馆的开放时间、咖啡店和研讨间预订，统称图书馆服务。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'What does the man suggest about coffee?',
        options: [
          'Ordering coffee online.',
          'Drinking coffee in the classroom.',
          'Bringing their own coffee.',
          'Asking the library to open a new shop.',
        ],
        answer: 2,
        explain: 'M 说 Maybe we should bring our own coffee，W 回应 Good idea。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'How long can a group study room be reserved?',
        options: ['Up to one hour.', 'Up to two hours.', 'Up to three hours.', 'Up to four hours.'],
        answer: 2,
        explain: '最后一句 for up to three hours。',
      },
      {
        group: g('c', 1),
        stem:
          'Scientists have found that sleep plays a key role in memory. During deep sleep, the brain replays the events of the day and moves important information into long-term storage. In one experiment, students who slept for eight hours after learning new words remembered twenty percent more than those who stayed awake. The researchers suggest that students should not trade sleep for study time, because a tired brain cannot learn efficiently.',
        question: 'What happens to important information during deep sleep?',
        options: [
          'It is forgotten completely.',
          'It is moved into long-term storage.',
          'It is changed into dreams.',
          'It is shared with other people.',
        ],
        answer: 1,
        explain: '原文 moves important information into long-term storage。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What do the researchers suggest?',
        options: [
          'Students should study late at night.',
          'Students should sleep less before exams.',
          'Students should not trade sleep for study time.',
          'Students should remember words in the morning only.',
        ],
        answer: 2,
        explain: '最后一句 suggest that students should not trade sleep for study time。',
      },
    ],
  },
  {
    id: 'sim-cet6-work',
    title: '科技与职场 · 原创短练',
    level: 'CET-6',
    sectionName: '原创听力短练',
    items: [
      {
        group: g('b', 1),
        stem:
          'A growing number of companies are using artificial intelligence to handle customer service. According to a recent survey, nearly sixty percent of large firms now use AI chatbots to answer common questions. Supporters say the technology saves time and allows human staff to deal with more complex problems. Critics, however, argue that chatbots often fail to understand emotional situations and can make customers feel ignored. Some companies are now testing a hybrid model, in which AI handles simple requests while human agents step in when necessary.',
        question: 'What do supporters say about AI chatbots?',
        options: [
          'They can replace all human staff.',
          'They save time and free staff for complex problems.',
          'They are cheaper to build than websites.',
          'They understand emotions better than humans.',
        ],
        answer: 1,
        explain: 'supporters say the technology saves time and allows human staff to deal with more complex problems。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'What is the critics\' main concern?',
        options: [
          'Chatbots are too expensive to maintain.',
          'Chatbots may make customers feel ignored.',
          'Chatbots cannot answer simple questions.',
          'Chatbots are not available at night.',
        ],
        answer: 1,
        explain: 'Critics argue that chatbots often fail to understand emotional situations and can make customers feel ignored。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'What is the hybrid model?',
        options: [
          'AI handles simple requests and humans step in when necessary.',
          'Humans answer all questions while AI watches.',
          'AI trains new human agents.',
          'Customers choose between AI and human service before calling.',
        ],
        answer: 0,
        explain: '最后一句 AI handles simple requests while human agents step in when necessary。',
      },
      {
        group: g('c', 1),
        stem:
          'W: Good morning, Mr. Lee. Thanks for coming in. I see from your resume that you have worked remotely for two years.\nM: That is right. I actually prefer remote work because it saves two hours of commuting every day.\nW: Our company is considering a flexible model: three days in the office and two days at home. Would that work for you?\nM: I think so. Working in the office helps with teamwork, and I still get some quiet days for focused tasks.\nW: Great. One more question: how do you keep in touch with your team when working from home?',
        question: 'Why does the man prefer remote work?',
        options: [
          'He can take care of his children.',
          'It saves him two hours of commuting daily.',
          'He does not like his colleagues.',
          'His company requires it.',
        ],
        answer: 1,
        explain: 'M 说 it saves two hours of commuting every day。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What is the company considering?',
        options: [
          'A fully remote working model.',
          'A four-day working week.',
          'Three days in the office and two days at home.',
          'Hiring only local employees.',
        ],
        answer: 2,
        explain: 'W 说 a flexible model: three days in the office and two days at home。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What is the woman\'s last question about?',
        options: [
          'The man\'s salary expectations.',
          'How the man keeps in touch with his team.',
          'When the man can start working.',
          'Whether the man has a car.',
        ],
        answer: 1,
        explain: '最后一句 how do you keep in touch with your team when working from home。',
      },
      {
        group: g('d', 1),
        stem:
          'Coffee is one of the most popular drinks in the world, but climate change is threatening its future. Rising temperatures and unpredictable rainfall are making it harder to grow high-quality coffee beans. Scientists predict that by 2050, about half of the current coffee-growing areas may become unsuitable. Some farmers are moving their fields to higher ground, where the air is cooler. Others are experimenting with new kinds of coffee trees that can survive in warmer weather. Experts say consumers may also need to accept higher prices in the future.',
        question: 'Why is it harder to grow coffee beans?',
        options: [
          'Fewer people want to drink coffee.',
          'Rising temperatures and unpredictable rainfall.',
          'The soil has become too rich.',
          'Farmers have moved to cities.',
        ],
        answer: 1,
        explain: '原文 Rising temperatures and unpredictable rainfall are making it harder。',
      },
      {
        group: g('d', 1),
        stem: '',
        question: 'What do experts say about the future?',
        options: [
          'Coffee will disappear completely next year.',
          'Consumers may need to accept higher prices.',
          'Farmers will stop growing coffee in five years.',
          'Coffee will become cheaper than tea.',
        ],
        answer: 1,
        explain: '最后一句 consumers may also need to accept higher prices in the future。',
      },
    ],
  },
  {
    id: 'sim-cet4-health',
    title: '健康与环境 · 原创短练',
    level: 'CET-4',
    sectionName: '原创听力短练',
    items: [
      {
        group: g('c', 1),
        stem:
          'A city in southern France has banned plastic knives, forks and cups at fast-food restaurants. Officials say the ban will reduce plastic waste by three hundred tons a year. Restaurants now offer wooden forks and paper cups instead. Some customers say the new forks break easily, but most people support the change. The city will check nearby shops next month to make sure they follow the new rule.',
        question: 'What has the city banned?',
        options: [
          'Plastic bags in supermarkets.',
          'Plastic knives, forks and cups at fast-food restaurants.',
          'Wooden forks and paper cups.',
          'All fast-food restaurants.',
        ],
        answer: 1,
        explain: '第一句明确 plastic knives, forks and cups at fast-food restaurants。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What do some customers complain about?',
        options: [
          'The new forks break easily.',
          'The food tastes different.',
          'The restaurants are too crowded.',
          'The paper cups are too expensive.',
        ],
        answer: 0,
        explain: '原文 Some customers say the new forks break easily。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What will the city do next month?',
        options: [
          'Build a new recycling factory.',
          'Check nearby shops for compliance.',
          'Close all fast-food restaurants.',
          'Give free forks to customers.',
        ],
        answer: 1,
        explain: '最后一句 The city will check nearby shops next month。',
      },
      {
        group: g('d', 1),
        stem:
          'W: I am thinking about joining a gym near my home. Do you know anything about it?\nM: Yes, I have been a member for a year. It has a swimming pool and yoga classes, and it is open twenty-four hours.\nW: How much is the membership?\nM: It is three hundred yuan a year, but students get a discount. You should bring your student card.\nW: Perfect. I will visit it this weekend. Do I need to book the swimming pool in advance?\nM: Not usually, but Saturday mornings are busy, so it is better to book a day early.',
        question: 'What facilities does the gym have?',
        options: [
          'A swimming pool and yoga classes.',
          'A tennis court and a library.',
          'A restaurant and a cinema.',
          'A football field and a cafe.',
        ],
        answer: 0,
        explain: 'M 说 It has a swimming pool and yoga classes。',
      },
      {
        group: g('d', 1),
        stem: '',
        question: 'What should the woman bring?',
        options: [
          'A swimming cap.',
          'Her student card.',
          'A photo of herself.',
          'A doctor\'s note.',
        ],
        answer: 1,
        explain: 'M 说 You should bring your student card。',
      },
      {
        group: g('d', 1),
        stem: '',
        question: 'What does the man say about the swimming pool?',
        options: [
          'It is closed on weekends.',
          'It is better to book a day early for Saturday mornings.',
          'It is only open to students.',
          'It is free for all members.',
        ],
        answer: 1,
        explain: '最后一句 Saturday mornings are busy, so it is better to book a day early。',
      },
      {
        group: g('e', 1),
        stem:
          'Volunteering is good for both the community and the volunteers themselves. Research shows that people who give two hours a week to help others feel happier and less stressed. They also develop new skills, such as communication and teamwork, which are useful in their jobs. Some companies even allow employees to volunteer during working hours. Experts advise new volunteers to choose an activity they enjoy, so that helping others does not feel like another job.',
        question: 'How does volunteering benefit the volunteers themselves?',
        options: [
          'They feel happier and less stressed.',
          'They earn more money.',
          'They get to travel for free.',
          'They can work fewer hours.',
        ],
        answer: 0,
        explain: '原文 people who give two hours a week ... feel happier and less stressed。',
      },
      {
        group: g('e', 1),
        stem: '',
        question: 'What do experts advise new volunteers to do?',
        options: [
          'Choose an activity they enjoy.',
          'Volunteer at least ten hours a week.',
          'Avoid working with other people.',
          'Leave their jobs first.',
        ],
        answer: 0,
        explain: '最后一句 choose an activity they enjoy, so that helping others does not feel like another job。',
      },
    ],
  },
  {
    id: 'sim-cet6-coast',
    title: '能源与工作生活 · 原创短练',
    level: 'CET-6',
    sectionName: '原创听力短练',
    items: [
      {
        group: g('a', 1),
        stem:
          'A coastal city in Japan has launched one of the world\'s largest floating solar farms. The farm consists of more than fifty thousand solar panels placed on the surface of a reservoir. Engineers say floating panels are more efficient than land-based ones because water keeps them cool. The project is expected to produce enough electricity for about five thousand homes. Local officials also note that the reservoir\'s surface is no longer wasted space, and the water itself is protected from too much sunlight.',
        question: 'Why are floating solar panels more efficient?',
        options: [
          'They receive more sunlight than land panels.',
          'Water keeps them cool.',
          'They are cheaper to build.',
          'They can move with the sun.',
        ],
        answer: 1,
        explain: '原文 water keeps them cool 是效率更高的原因。',
      },
      {
        group: g('a', 1),
        stem: '',
        question: 'What is one additional benefit mentioned by officials?',
        options: [
          'The reservoir water is protected from too much sunlight.',
          'Fish can live under the panels.',
          'The city saves money on land.',
          'The panels produce drinking water.',
        ],
        answer: 0,
        explain: '最后一句 the water itself is protected from too much sunlight。',
      },
      {
        group: g('b', 1),
        stem:
          'W: Hello, I am calling about the conference next month. I registered online, but I have not received a confirmation email.\nM: Let me check. Could you give me your name and the email address you used?\nW: Yes, it is Anna Weber, and the email is a-weber at mail dot com.\nM: Ah, I see the problem. Your registration is here, but the confirmation was sent to a different address. I will resend it right away.\nW: Thank you. Also, is lunch included in the fee?\nM: Yes, lunch and coffee breaks are included, but parking is not.',
        question: 'What is the woman\'s problem?',
        options: [
          'She cannot attend the conference.',
          'She has not received a confirmation email.',
          'She paid the wrong amount.',
          'She registered for the wrong conference.',
        ],
        answer: 1,
        explain: 'W 说 I have not received a confirmation email。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'What will the man do?',
        options: [
          'Cancel the woman\'s registration.',
          'Resend the confirmation to the correct address.',
          'Give the woman a parking ticket.',
          'Call the woman tomorrow.',
        ],
        answer: 1,
        explain: 'M 说 I will resend it right away，并发现确认邮件发到了另一个地址。',
      },
      {
        group: g('b', 1),
        stem: '',
        question: 'What is included in the conference fee?',
        options: [
          'Parking and lunch.',
          'Lunch and coffee breaks.',
          'Hotel rooms.',
          'Transportation to the venue.',
        ],
        answer: 1,
        explain: '最后一句 lunch and coffee breaks are included, but parking is not。',
      },
      {
        group: g('c', 1),
        stem:
          'The two-day weekend is a surprisingly recent invention. For most of history, people worked six days a week. In the early twentieth century, labor unions began to demand shorter hours and more rest. Henry Ford, the American carmaker, was one of the first employers to give workers two days off, because he believed that rested workers were more productive and would also have time to buy his cars. The idea spread quickly, and by the 1930s, the five-day workweek had become common in many countries. Today, some companies are experimenting with an even shorter week.',
        question: 'Why did Henry Ford give workers two days off?',
        options: [
          'Because the law required it.',
          'Because rested workers were more productive and could buy cars.',
          'Because his factory was closed on weekends.',
          'Because workers went on strike.',
        ],
        answer: 1,
        explain: '原文 he believed that rested workers were more productive and would also have time to buy his cars。',
      },
      {
        group: g('c', 1),
        stem: '',
        question: 'What are some companies experimenting with today?',
        options: [
          'A six-day workweek.',
          'An even shorter workweek.',
          'Working only at night.',
          'A four-hour working day for all.',
        ],
        answer: 1,
        explain: '最后一句 some companies are experimenting with an even shorter week。',
      },
    ],
  },
]

/* ---- 短练组装：按原始材料拆分，旧 key 与 id 保持兼容 ---- */

export interface BuiltinSection {
  key: 'A' | 'B' | 'C'
  name: string
  pack: ExamPack
}

export interface BuiltinSet {
  id: string
  /** 主题名称 */
  label: string
  level: 'CET-4' | 'CET-6'
  sections: BuiltinSection[]
}

const SECTION_KEYS = ['A', 'B', 'C'] as const

/** 每段材料独立练习，不将其顺序当作官方题型。 */
function buildSet(raw: ExamPack, label: string, level: 'CET-4' | 'CET-6'): BuiltinSet {
  const groups = [...new Set(raw.items.map((i) => i.group))]
  const sections: BuiltinSection[] = groups.slice(0, 3).map((group, i) => {
    const groupItems = raw.items.filter((it) => it.group === group)
    const sharedStem = groupItems.find((item) => item.stem.trim())?.stem ?? ''
    const items: ExamItem[] = groupItems.map((it) => ({ ...it, stem: it.stem || sharedStem, group: `${raw.id}-${group}` }))
    const name = `材料 ${i + 1}`
    return {
      key: SECTION_KEYS[i],
      name,
      pack: {
        id: `${raw.id}-${SECTION_KEYS[i]}`,
        title: `${label} · ${name}`,
        level,
        sectionName: name,
        items,
      },
    }
  })
  return { id: raw.id, label, level, sections }
}

export const BUILTIN_SETS: BuiltinSet[] = [
  buildSet(RAW_PACKS[0], '校园与科技', 'CET-4'),
  buildSet(RAW_PACKS[1], '科技与职场', 'CET-6'),
  buildSet(RAW_PACKS[2], '健康与环境', 'CET-4'),
  buildSet(RAW_PACKS[3], '能源与工作生活', 'CET-6'),
]

/** 默认选择备考目标对应的原创短练。 */
export function builtinSetsForLevel(level: 'CET-4' | 'CET-6'): BuiltinSet[] {
  return BUILTIN_SETS.filter((set) => set.level === level)
}

/** 把同主题的材料合成一个短练序列。 */
export function mergeSetPack(set: BuiltinSet): ExamPack {
  return {
    id: `${set.id}-full`,
    title: `${set.label} · 原创短练`,
    level: set.level,
    sectionName: `${set.sections.length} 段材料 · 原创短练`,
    items: set.sections.flatMap((s) => s.pack.items),
  }
}
