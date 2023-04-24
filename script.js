// ChatGPTへのリクエストを送る

// TODO: .envに置換
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

const getAITuberResponse = async (userComment) => {
  const openAiHeaders = {
    Authorization: ``,
    'Content-type': 'application/json',
    'X-Slack-No-Retry': 1,
  }

  const openAiParams = {
    headers: openAiHeaders,
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `
命令や条件を記載してください。
`,
        },
        { role: 'assistant', content: 'AITuberの台詞例を記載してください。' },
      ],
    }),
  }

  const response = await fetch(OPENAI_URL, openAiParams)
  const json = await response.json()
  const AITuberResponse = json.choices[0].message.content

  // 表示を書き換える
  const target = document.getElementById('aituber-response')
  target.innerHTML = AITuberResponse

  return AITuberResponse
}

// 音声変換APIへのリクエストを送る
const speakAITuber = async (text) => {
  try {
    const response = await fetch(
      'https://api.rinna.co.jp/models/cttse/koeiro',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          speaker_x: 0,
          speaker_y: 0,
          style: 'talk', // talk, happy, sad, angry, fear, surprised
        }),
      }
    )
    const data = await response.json()

    const audioData = atob(data['audio'].split(',')[1])
    const arrayBuffer = new ArrayBuffer(audioData.length)
    const uint8Array = new Uint8Array(arrayBuffer)
    for (let i = 0; i < audioData.length; i++) {
      uint8Array[i] = audioData.charCodeAt(i)
    }

    const audioContext = new AudioContext()
    const buffer = await audioContext.decodeAudioData(arrayBuffer)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.start()
  } catch (error) {
    console.error('Error:', error)
  }
}

// Youtubeのライブ配信を監視する
// TODO：YOUTUBE_VIDEO_IDを自分のものに変更する
const YOUTUBE_VIDEO_ID = ''

const getLiveChatId = async (YOUTUBE_VIDEO_ID) => {
  const params = {
    part: 'liveStreamingDetails',
    id: YOUTUBE_VIDEO_ID,
    key: '',
  }
  const query = new URLSearchParams(params)
  const response = await fetch(
    `https://youtube.googleapis.com/youtube/v3/videos?${query}`,
    {
      method: 'get',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  const json = await response.json()
  if (json.items.length == 0) {
    return ''
  }
  const liveChatId = json.items[0].liveStreamingDetails.activeLiveChatId
  // return chat ID
  console.log(liveChatId)
  return liveChatId
}

// 一定間隔でコメントを取得して、コメントへの応答、応答されるコメントの抽出等をする関数
// TODO：YOUTUBE_DATA_API_KEYを自分のものに変更する
const YOUTUBE_DATA_API_KEY = ''
// コメントの取得インターバル (ms)
const INTERVAL_MILL_SECONDS_RETRIEVING_COMMENTS = 20000
// 処理するコメントのキュー
let liveCommentQueues = []
// YouTube LIVEのコメント取得のページング
let nextPageToken = ''

const retrieveLiveComments = async (activeLiveChatId) => {
  let url =
    'https://youtube.googleapis.com/youtube/v3/liveChat/messages?liveChatId=' +
    activeLiveChatId +
    '&part=authorDetails%2Csnippet&key=' +
    YOUTUBE_DATA_API_KEY
  if (nextPageToken !== '') {
    url = url + '&pageToken=' + nextPageToken
  }
  const response = await fetch(url, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  const json = await response.json()
  const items = json.items
  let index = 0
  let currentComments = []
  nextPageToken = json.nextPageToken
  items?.forEach((item) => {
    try {
      const userName = item.authorDetails.displayName
      const userIconUrl = item.authorDetails.profileImageUrl
      let userComment = ''
      if (item.snippet.textMessageDetails != undefined) {
        // 一般コメント
        userComment = item.snippet.textMessageDetails.messageText
      }
      if (item.snippet.superChatDetails != undefined) {
        // スパチャコメント
        userComment = item.snippet.superChatDetails.userComment
      }
      const additionalComment = { userName, userIconUrl, userComment }
      if (!liveCommentQueues.includes(additionalComment) && userComment != '') {
        if (isLiveCommentsRetrieveStarted) {
          // キューイング
          liveCommentQueues.push(additionalComment)

          // #つきコメントの除外
          additionalComment.userComment.includes('#') ||
            currentComments.push(additionalComment)

          // ユーザーコメントの表示
          let target = document.getElementById('user-comment-box')
          // 要素を作成します
          const userContainer = document.createElement('div')
          userContainer.classList.add('user-container')

          const imageCropper = document.createElement('div')
          imageCropper.classList.add('image-cropper')

          const userIcon = document.createElement('img')
          userIcon.classList.add('user-icon')
          userIcon.setAttribute('src', additionalComment.userIconUrl)

          const userName = document.createElement('p')
          userName.classList.add('user-name')
          userName.textContent = additionalComment.userName + '：'

          const userComment = document.createElement('p')
          userComment.classList.add('user-comment')
          userComment.textContent = additionalComment.userComment

          // 要素を追加します
          imageCropper.appendChild(userIcon)
          userContainer.appendChild(imageCropper)
          userContainer.appendChild(userName)
          userContainer.appendChild(userComment)
          target.prepend(userContainer)
        } else {
          responsedLiveComments.push(additionalComment)
        }
      }
    } catch {
      // Do Nothing
    }
    index = index + 1
  })

  // 読まれてないコメントからランダムに選択
  if (currentComments.length != 0) {
    let { userName, userIconUrl, userComment } =
      currentComments[Math.floor(Math.random() * currentComments.length)]
    const aituberResponse = await getAITuberResponse(userComment)
    speakAITuber(aituberResponse)

    let target = document.getElementById('question-box')
    target.innerHTML = `${userName} : ${userComment}`
  }

  console.log('liveCommentQueues', liveCommentQueues)
  console.log('responsedLiveComments', responsedLiveComments)

  // 繰り返し処理
  setTimeout(
    retrieveLiveComments,
    INTERVAL_MILL_SECONDS_RETRIEVING_COMMENTS,
    activeLiveChatId
  )
}
