let cachedJavaScriptPlayerCode = null;
let cachedSignatureTimestamp = null;
let globalInfo = null;
let cachedSignatureDeobfuscationFunction = null;
let youtubeCookie = null;
let youtubeVisitorId = null;

function print(msg, obj) {
  if (globalInfo && globalInfo.noPrint == true) {
   return;
  }
  console.log(msg, obj)
}

async function httpGet(url, headers) {
    return sendMessage('flutterFetch', JSON.stringify(
        {
            'url': url,
            'method': 'GET',
            'headers': headers,
        }
    ));
}

async function httpPost(url, headers, body) {
    return sendMessage('flutterFetch', JSON.stringify(
        {
            'url': url,
            'method': 'POST',
            'headers': headers,
            'body': body,
        }
    ));
}

async function httpPostJson(url, headers, body) {
    let res = await httpPost(url, headers, body);
    return getJsonBody(res);
}

function getJsonBody(res) {
    if (res != null) {
        if (res['mapBody'] != null) {
            return res['mapBody'];
        }
        if (res['txtBody'] != null) {
            return JSON.parse(res['txtBody']);
        }
    }
    return null;
}

function getTextBody(res) {
    if (res != null && res['txtBody'] != null) {
        return res['txtBody'];
    }
    return null;
}

function getResponseHeaders(res) {
    if (res != null && res['responseHeaders'] != null) {
        return res['responseHeaders'];
    }
    return null;
}

async function httpGetText(url, headers) {
    let res = await httpGet(url, headers);
    return getTextBody(res);
}

function getDefaultGlobalInfo() {
    return {
        'countryCode': "US",
        'languageCode': "en",
        'clientVersion': "2.20240724.00.00",
        'clientName': "WEB",
        'platform': "DESKTOP",
        'utcOffsetMinutes': 0,
        'osName': "Macintosh",
        'osVersion': "10_15_7",
        'deviceMake': "Apple",
        'deviceModel': "",
        'androidSdkVersion': null,
        'enableSafetyMode': false,
        'visitorData': null,
        'requiredVisitorData': null,
        'cookie': null,
        'cookieLogin': null,
        'iosClientName': "IOS",
        'iosClientVersion': "19.28.1",
        'iosPlatform': "MOBILE",
        'iosDeviceMake': "Apple",
        'iosOSName': "iOS",
        'iosDeviceModel': "iPhone16,2",
        'isIOS' : true,
        'forceHls' : true,
        'forceHlsAgent' : null,
        'useCookieForHls' : false,
        'useVisitorIdForHls' : false,
        'iosOsVersion': "17.5.1.21F90",
      };
}

async function getYoutubeStreamData(param) {
    let videoId = param["videoId"];
    if (param["globalInfo"]) {
      globalInfo = param["globalInfo"];
      print('JS set globalInfo', globalInfo);
    } else {
        if (globalInfo == null) {
            globalInfo = getDefaultGlobalInfo()
        }
    }
    let hlsManifestUrl = await getHlsManifestUrl(videoId);
    print('JS hlsManifestUrl', hlsManifestUrl);

    let html5Cpn = generateContentPlaybackNonce()
    print('JS html5Cpn', html5Cpn);
    let sts = await getSignatureTimestamp();
    print('JS signature Timestamp ', sts);
    /// Body Web
    let body = createDesktopPlayerBody(
        videoId,
        sts,
        html5Cpn,
        false
    );
    /// Next
    let bodyNext = getContextBody(true);
    bodyNext["videoId"] = videoId;
    bodyNext["contentCheckOk"] = true;
    bodyNext["racyCheckOk"] = true;
    /// ios
    let iosCpn = generateContentPlaybackNonce();
    let iosBody = prepareIosMobileJsonBuilder();
    iosBody["videoId"] = videoId;
    iosBody["cpn"] = iosCpn;
    iosBody["contentCheckOk"] = true;
    iosBody["racyCheckOk"] = true;

    let playerResponseFuture = getJsonPostResponse(
        "player",
        body,
        null,
      );
    let iosResponseFuture = null;
    if (hlsManifestUrl == null || globalInfo.forceHls == false) {
        iosResponseFuture = getJsonIosPostResponse("player", iosBody, `&t=${generateTParameter()}&id=${videoId}`,);
    }
    let nextResponseFuture = getJsonPostResponse(
        "next",
        bodyNext,
        null,
      );
    
    let playerResponse = await playerResponseFuture;
    let nextResponse = await nextResponseFuture;
    let iosResponse = null;
    if (iosResponseFuture) {
        iosResponse = await iosResponseFuture;
    }
    print("JS playerRes", playerResponse == null);
    print("JS nextResponse", nextResponse == null);
    print("JS iosResponse", iosResponse == null);
    let data = await extractStreamData({
        playerResponse: playerResponse,
        nextResponse: nextResponse,
        iosResponse: iosResponse,
        videoId: videoId,
        html5Cpn: html5Cpn, 
        iosCpn: iosCpn,
        hlsManifestUrl: hlsManifestUrl
    });
    if (data.id == videoId) {
      if (globalInfo.isIOS === false) {
        print("JS return stringify data");
        return JSON.stringify(data);
      } else {
        print("JS return map data");
        return data;
      }
    } else {
        print("JS return empty");
        return "";
    }
}

async function getHlsManifestUrl(videoId) {
    if (youtubeVisitorId == null) {
      await getYoutubeVisitorDataForHls();
    }
    let path = `https://www.youtube.com/watch?v=${videoId}`;
    try {
        let headers = {
            'Host': 'www.youtube.com',
            'accept': '*/*',
            'origin': 'https://www.youtube.com',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15',
            'referer': path,
        };
        /*
        let cookie = getCookieString();
        if (cookie != null && cookie != '' && globalInfo?.useCookieForHls == true) {
            headers['Cookie'] = cookie;
        }
        */
        if (youtubeCookie != null) {
          headers['Cookie'] = youtubeCookie;
        }
        /*
        if (globalInfo?.useVisitorIdForHls == true) {
            headers['x-goog-visitor-id'] = getVisitorId();
        }
        */
        if (youtubeVisitorId != null) {
          headers['x-goog-visitor-id'] = youtubeVisitorId;
        }
        let text = await httpGetText(path, headers);
        if (text != null && (typeof text === "string")) {
            const html = text;
            const str1 = '"hlsManifestUrl":"';
            const str2 = '.m3u8",';
            let idx1 = html.indexOf(str1);
            if (idx1 >= 0) {
              idx1 += str1.length;
              const idx2 = html.indexOf(str2, idx1);
              if (idx2 >= 0) {
                const url = html.substring(idx1, idx2 + str2.length - 2);
                let hlsManifestUrl = url;
                return hlsManifestUrl;
              }
            }
        }
    } catch (e) {
        print(e);
    }
    print('JS getHlsManifestUrl return null');
    return null;
}

function getVisitorId() {
    if (globalInfo == null) {
        return null;
    }
    return globalInfo.visitorData ?? globalInfo.requiredVisitorData;
}

function getCookieString() {
    if (globalInfo == null) {
        return null;
    }
    if (globalInfo.cookieLogin != null) {
        if (globalInfo.cookieLogin.cookies != null) {
            let cookies = globalInfo.cookieLogin.cookies;
            let ret = "";
            for (const [key, val] of Object.entries(cookies)) {
              if (ret) {
                ret += `; ${key}=${val}`;
              } else {
                ret += `${key}=${val}`;
              }
            }
            return ret;
        }
    }
    return null;
}

function generateContentPlaybackNonce() {
    let result = '';
    let length = 16;
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < length; i++) {
        result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
}

function generateTParameter() {
    let result = '';
    let length = 12;
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < length; i++) {
        result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  }

async function extractJavaScriptUrlWithIframeResource() {
    const iframeUrl = "https://www.youtube.com/iframe_api";
    let iframeContent = null;
    try {
        iframeContent = await httpGetText(iframeUrl);
    } catch (e) {
        print(`Could not fetch IFrame resource:`, e);
    }
    if (!iframeContent) {
        return null;
    }
    try {
        const PLAYER_PATTERN = /player\\\/([a-z0-9]{8})\\\//;
        const match = PLAYER_PATTERN.exec(iframeContent);
        if (match && match[1]) {
            const hash = match[1];
            return `https://www.youtube.com/s/player/${hash}/player_ias.vflset/en_GB/base.js`;
        }
    } catch (e) {
        print(`IFrame resource didn't provide JavaScript base player's hash:`, e);
    }
    return null;
}

async function extractJavaScriptCodeIfNeeded() {
    if (!cachedJavaScriptPlayerCode) {
        cachedJavaScriptPlayerCode = await extractJavaScriptPlayerCode();
        print("JS get new JavaScriptPlayerCode");
    }
    return cachedJavaScriptPlayerCode;
}

async function runInitCode() {
  await extractJavaScriptCodeIfNeeded()
}

async function extractJavaScriptPlayerCode() {
    let url = null;
    try {
      url = await extractJavaScriptUrlWithIframeResource();
      if (url == null) {
        print("JS javaScriptUrl == null")
        return null;
      }
      let playerJsUrl = cleanJavaScriptUrl(url);
      print("JS JavaScriptPlayerUrl", playerJsUrl)
      let code = await downloadJavaScriptCode(playerJsUrl);
      return code;
    } catch (e) {
      print('JS extractJavaScriptPlayerCode error ', e);
    }
    return null;
  }

  function cleanJavaScriptUrl(javaScriptPlayerUrl) {
    if (javaScriptPlayerUrl.startsWith("//")) {
      return `https:${javaScriptPlayerUrl}`;
    } else if (javaScriptPlayerUrl.startsWith("/")) {
      return `https://www.youtube.com${javaScriptPlayerUrl}`;
    } else {
      return javaScriptPlayerUrl;
    }
  }

  async function downloadJavaScriptCode(url) {
    try {
      let res = await httpGetText(url)
      return res;
    } catch (e) {
      print("Could not get JavaScript base player's code", e);
    }
    return null;
  }

  async function getSignatureTimestamp() {
    if (cachedSignatureTimestamp != null) {
      return cachedSignatureTimestamp;
    }
    await extractJavaScriptCodeIfNeeded();
    try {
      if (cachedJavaScriptPlayerCode != null) {
        const STS_REGEX = /signatureTimestamp[=:](\d+)/;
        const match = STS_REGEX.exec(cachedJavaScriptPlayerCode);
        if (match) {
            const timestamp = match[1];
            if (timestamp != null) {
                cachedSignatureTimestamp = parseInt(timestamp, 10);
            }
        } else {
            print("JS getSignatureTimestamp No match found.");
        }
      }
    } catch (e) {
        print("getSignatureTimestamp exception", e);
    }
    return cachedSignatureTimestamp ?? 20073;
  }

  function createDesktopPlayerBody(
    videoId,
    sts,
    contentPlaybackNonce = null,
    isTvHtml5 = false,
  ) {
    let body;
    body = isTvHtml5 ? getTvHtml5EmbedBody(videoId) : getContextBody({ isDesktop: true });
    body["playbackContext"] = {
      "contentPlaybackContext": {
        "signatureTimestamp": sts,
        "referer": `https://www.youtube.com/watch?v=${videoId}`
      }
    };
    if (contentPlaybackNonce) {
        body["cpn"] = contentPlaybackNonce;
    }
    body["videoId"] = videoId;
    body["contentCheckOk"] = true;
    body["racyCheckOk"] = true;
    return body;
  }

  function getClientBodyTvHtml5Embed() {
    const clientBody = {
      "client": {
        "hl": globalInfo.languageCode || 'en',
        "gl": globalInfo.countryCode || 'US',
        "clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
        "clientVersion": "2.0",
        "clientScreen": "EMBED",
        "platform": "TV",
        "utcOffsetMinutes": globalInfo.utcOffsetMinutes ?? 0,
      }
    };
    if (globalInfo && globalInfo.visitorData != null) {
      clientBody["client"]["visitorData"] = globalInfo.visitorData;
    }
    return clientBody;
  }

  function getRequestBody() {
    return {
      request: {
        useSsl: true,
        internalExperimentFlags: []
      }
    };
  }

  function getUserBody() {
    const userBody = {
      user: {
        lockedSafetyMode: false,
      }
    };
    if (globalInfo && globalInfo.enableSafetyMode) {
      userBody.user.enableSafetyMode = true;
    }
    return userBody;
  }

  function getTvHtml5EmbedBody(videoId) {
    return {
      context: {
        ...getClientBodyTvHtml5Embed(),
        thirdParty: {
          embedUrl: `https://www.youtube.com/watch?v=${videoId}`
        },
        ...getRequestBody(),
        ...getUserBody()
      }
    };
  }

  function getContextBody(isDesktop = false) {
    const contextBody = {
      context: {
        ...((isDesktop === true) ? getClientBodyDesktop() : getClientBody()),
        ...getRequestBody(),
        ...getUserBody(),
      }
    };
    return contextBody;
  }

  function getClientBodyDesktop(forceVisitorData = false) {
    let visitorData = null;
    if (globalInfo != null) {
        visitorData = globalInfo.visitorData || (forceVisitorData ? globalInfo.requiredVisitorData : null);
    }
    const clientBody = {
      client: {
        hl: globalInfo.languageCode || 'en',
        gl: globalInfo.countryCode || 'US',
        clientName: globalInfo.clientName,
        clientVersion: globalInfo.clientVersion,
        originalUrl: "https://www.youtube.com/",
        platform: globalInfo.platform,
        utcOffsetMinutes: globalInfo.utcOffsetMinutes || 0,
      }
    };
    if (visitorData !== null) {
      clientBody.client.visitorData = visitorData;
    }
    return clientBody;
  }

  function getClientBody(forceVisitorData = false) {
    let visitorData = null;
    if (globalInfo != null) {
        visitorData = globalInfo.visitorData || (forceVisitorData ? globalInfo.requiredVisitorData : null);
    }
    const clientBody = {
      client: {
        hl: globalInfo.languageCode,
        gl: globalInfo.countryCode,
        clientName: globalInfo.clientName,
        clientVersion: globalInfo.clientVersion,
        platform: globalInfo.platform,
        osName: globalInfo.osName,
        osVersion: globalInfo.osVersion,
        utcOffsetMinutes: globalInfo.utcOffsetMinutes,
      }
    };
    if (globalInfo.deviceMake !== null) {
      clientBody.client.deviceMake = globalInfo.deviceMake;
    }
    if (globalInfo.deviceModel !== null) {
      clientBody.client.deviceModel = globalInfo.deviceModel;
    }
    if (globalInfo.androidSdkVersion !== null) {
      clientBody.client.androidSdkVersion = globalInfo.androidSdkVersion;
    }
    if (visitorData !== null) {
      clientBody.client.visitorData = visitorData;
    }
    return clientBody;
  }

  function getYouTubeHeaders(forceVisitorData = false) {
    return getClientInfoHeaders(forceVisitorData);
  }

  function getClientInfoHeaders(forceVisitorData = false) {
    return {
      ...getOriginReferrerHeaders("https://www.youtube.com"),
      ...getClientHeaders(
        "1",
        globalInfo.clientVersion ?? "2.20240724.00.00",
        forceVisitorData,
      )
    };
  }

  function getOriginReferrerHeaders(url) {
    return {
      origin: url,
      referer: url
    };
  }

  function getClientHeaders(name, version, forceVisitorData = false) {
    const visitorData = globalInfo.visitorData || (forceVisitorData ? globalInfo.requiredVisitorData : null) || null;
    const headers = {
      host: "www.youtube.com",
      "x-youtube-client-name": name,
      "x-youtube-client-version": version,
      "sec-ch-ua-mobile": "?0",
      "sec-fetch-dest": "empty",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "same-origin"
    };
    if (visitorData) {
      headers["x-goog-visitor-id"] = visitorData;
    }
    return headers;
  }

  async function getJsonPostResponse(endpoint, body, forceVisitorData = false, header = null) {
    const headers = getYouTubeHeaders(forceVisitorData);
    if (header) {
      Object.assign(headers, header);
    }
    try {
      const response = await httpPostJson(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`,
        headers,
        body,
      );
      return response;
    } catch (error) {
      console.error('Error in POST request:', error);
    }
    return null;
  }

  function prepareIosMobileJsonBuilder() {
    const body = {
      context: {
        client: {
          clientName: "IOS",
          clientVersion: globalInfo.iosClientVersion,
          deviceMake: globalInfo.iosDeviceMake,
          deviceModel: globalInfo.iosDeviceModel,
          platform: "MOBILE",
          osName: "iOS",
          osVersion: globalInfo.iosOsVersion,
          hl: globalInfo.languageCode,
          gl: globalInfo.countryCode,
          utcOffsetMinutes: globalInfo.utcOffsetMinutes,
        },
        ...getRequestBody(), // Assuming getRequestBody() is available
        user: {
          lockedSafetyMode: false
        }
      }
    };
    return body;
  }

  function getIosUserAgent() {
    const IOS_USER_AGENT_VERSION = "17_5_1";
    return `com.google.ios.youtube/${globalInfo.iosClientVersion}(${globalInfo.iosDeviceModel}; U; CPU iOS ${IOS_USER_AGENT_VERSION} like Mac OS X; ${globalInfo.countryCode})`;
  }

  async function getMobilePostResponse(endpoint, body, userAgent, endPartOfUrlRequest = null, header = null) {
    const headers = {
      "user-agent": userAgent,
      "x-goog-api-format-version": "2",
      "content-type": "application/json",
      ...header
    };
  
    let baseEndpointUrl = `https://youtubei.googleapis.com/youtubei/v1/${endpoint}?prettyPrint=false`;
    if (endPartOfUrlRequest) {
      baseEndpointUrl += endPartOfUrlRequest;
    }
    try {
      const res = await httpPostJson(baseEndpointUrl, headers, body);
      return res;
    } catch (e) {
      console.error("getMobilePostResponse", e);
    }
    return null;
  }

  function getJsonIosPostResponse(endpoint, body = null, endPartOfUrlRequest = null) {
    return getMobilePostResponse(endpoint, body, getIosUserAgent(), endPartOfUrlRequest, null);
  }

  async function extractStreamData({
    playerResponse, nextResponse, iosResponse, videoId, html5Cpn, iosCpn, hlsManifestUrl
  }) {
    let ret = {};
    let response = playerResponse;
    ret.cpn = html5Cpn;
    if (response == null) {
        response = iosResponse;
        ret.cpn = iosCpn;
    }
    /// streamType
    let streamType = "VIDEO_STREAM"
    if (response?.playabilityStatus?.liveStreamability != null) {
        streamType = "LIVE_STREAM"
    } else if (response?.videoDetails?.isPostLiveDvr == true) {
        streamType = "POST_LIVE_STREAM";
    }
    ret.streamType = streamType;
    /// videoId
    ret.id = videoId;
    /// Name
    let title = response?.videoDetails?.title;
    if (!title) {
        title = getTextFromObject(getVideoInfoRenderer(nextResponse, "videoPrimaryInfoRenderer")?.title);
    }
    ret.name = title;
    // ret.url = map['url'];
    // ret.originalUrl = map['originalUrl'];
    ret.nextResponse = nextResponse;
    
    ret.thumbnails = response?.videoDetails?.thumbnail?.thumbnails;

    // ret.textualUploadDate = map['textualUploadDate'];
    let dateText = getTextFromObject(getVideoPrimaryInfoRenderer(nextResponse)?.dateText)
    ret.textualUploadDate = dateText
    ret.uploadDateText = dateText

    // ret.duration = map['duration'];
    try {
        const duration = response?.videoDetails?.lengthSeconds;
        if (duration) {
            ret.duration = parseInt(duration, 10);
        }
    } catch (e) {
    }

    // ret.ageLimit = map['ageLimit'];

    // ret.description 
    let description = getTextFromObject(getVideoSecondaryInfoRenderer()?.description);
    if (!description) {
        description = getTextFromObject(getVideoSecondaryInfoRenderer()?.attributedDescription);
    }
    if (!description) {
        description = response?.videoDetails?.shortDescription;
    }
    if (!description) {
        description = getTextFromObject(response?.microformat?.playerMicroformatRenderer?.description);
    }
    ret.description = {
        content: description,
        type: 3
    }

    // ret.viewCount = map['viewCount'];
    let views = getTextFromObject(getVideoPrimaryInfoRenderer(nextResponse)?.viewCount?.videoViewCountRenderer?.viewCount);
    if (!views) {
        views = response?.videoDetails?.viewCount;
    }
    if (views) {
        if (views.toLowerCase().includes("no views")) {
            ret.viewCount = 0;
        } else {
            try {
                ret.viewCount = parseInt(removeNonDigitCharacters(views), 10);
            } catch (e) {
            }
        }
    }

    // ret.commentCount = map['commentCount'];
    try {
        const contents = nextResponse?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        if (Array.isArray(contents)) {
            for (const item of contents) {
                const sectionContents = item?.itemSectionRenderer?.contents;
                if (Array.isArray(sectionContents)) {
                for (const value of sectionContents) {
                    const commentCountObj = value?.commentsEntryPointHeaderRenderer?.commentCount;
                    if (commentCountObj) {
                        const countTxt = getTextFromObject(commentCountObj, false);
                        const count = parseInt(countTxt, 10);
                        if (!isNaN(count)) {
                            ret.commentCount = count;
                        }
                    }
                }
                }
            }
        }
    } catch (e) {
    }

    // ret.commentCountText = map['commentCountText'];
    const contents = nextResponse?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (Array.isArray(contents)) {
      for (const item of contents) {
        const sectionContents = item?.itemSectionRenderer?.contents;
        if (Array.isArray(sectionContents)) {
          for (const value of sectionContents) {
            const commentCountObj = value?.commentsEntryPointHeaderRenderer?.commentCount;
            if (commentCountObj) {
              const countTxt = getTextFromObject(commentCountObj);
              ret.commentCountText = countTxt;
            }
          }
        }
      }
    }

    // ret.likeCount = map['likeCount'];
    if (playerResponse?.videoDetails?.allowRatings == false) {
        ret.likeCount = 0;
    } else {
        let topLevelButtons = getVideoPrimaryInfoRenderer(nextResponse)?.videoActions?.menuRenderer?.topLevelButtons;
        let count = null;
        try {
            count = parseLikeCountFromLikeButtonViewModel(topLevelButtons);
        } catch (e) {
        }
        if (!count) {
            try {
                count = parseLikeCountFromLikeButtonRenderer(topLevelButtons);
            } catch (e) {
            }
        }
        if (count != null) {
            ret.likeCount = count;
        }
    }

    // ret.dislikeCount = map['dislikeCount'];

    // ret.viewCountText = map['viewCountText'];
    ret.viewCountText = getViewCountText(response, nextResponse);

    // ret.uploaderName = map['uploaderName'];
    ret.uploaderName = response?.videoDetails?.author

    // ret.uploaderUrl = map['uploaderUrl'];
    ret.uploaderUrl = response?.videoDetails?.channelId

    // ret.uploaderAvatars = Image.parseThumbnails(map['uploaderAvatars']);
    ret.uploaderAvatars = getVideoSecondaryInfoRenderer(nextResponse)?.owner?.videoOwnerRenderer?.thumbnail?.thumbnails;

    // ret.uploaderVerified = map['uploaderVerified'];

    // ret.uploaderSubscriberCount = map['uploaderSubscriberCount'];
    let videoOwnerRenderer = getVideoSecondaryInfoRenderer(nextResponse)?.owner?.videoOwnerRenderer;
    if (videoOwnerRenderer?.subscriberCountText != null) {
        try {
            ret.uploaderSubscriberCount = mixedNumberWordToLong(getTextFromObject(videoOwnerRenderer?.subscriberCountText));
        } catch (e) {
        }
    }

    // ret.uploaderSubscriberCountText = map['uploaderSubscriberCountText'];
    if (videoOwnerRenderer?.subscriberCountText != null) {
        ret.uploaderSubscriberCountText = getTextFromObject(videoOwnerRenderer?.subscriberCountText);
    }

    // ret.subChannelName = map['subChannelName'] ?? '';
    // ret.subChannelUrl = map['subChannelUrl'] ?? '';
    // ret.subChannelAvatars = Image.parseThumbnails(map['subChannelAvatars']);

    // ret.relatedItems = map['relatedItems'] is List ? InfoItem.parseList(map['relatedItems']) : null;
    ret.relatedItems = getRelatedItems(nextResponse);

    // ret.startPosition = map['startPosition'];
    ret.host = '';
    ret.category = '';
    ret.licence = '';
    ret.supportInfo = '';
    // ret.tags = map['tags'] is List ? (map['tags'] as List).map((e) {
    //   return e.toString();
    // }).toList() : null;
    // ret.streamSegments = map['streamSegments'] is List ? StreamSegment.parseList(map['streamSegments']) : null;
    // ret.metaInfo = map['metaInfo'] is List ? MetaInfo.parseList(map['metaInfo']) : null;
    // ret.shortFormContent = map['shortFormContent'];

    ret.liveChatRenderer = nextResponse?.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer;

    // ret.nextToken = map['nextToken'] ?? '';
    let loadMoreToken = '';
    const secondaryResults = nextResponse?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults;
    let results = secondaryResults?.results;
  
    if (Array.isArray(results) && results.length === 2 && Array.isArray(results[1]?.itemSectionRenderer?.contents)) {
      results = results[1]?.itemSectionRenderer?.contents;
    }
  
    if (Array.isArray(results)) {
      for (const item of results) {
        if (typeof item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token === 'string') {
          loadMoreToken = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || '';
        }
      }
    }
  
    if (!loadMoreToken) {
      const continuations = secondaryResults?.continuations;
      if (Array.isArray(continuations)) {
        for (const item of continuations) {
          if (typeof item?.nextContinuationData?.continuation === 'string') {
            loadMoreToken = item?.nextContinuationData?.continuation || '';
          }
        }
      }
    }
  
    ret.nextToken = loadMoreToken;

    ret.playbackTracking = response?.playbackTracking
    // ret.closeCaptionTrack
    let playerCaptionsTracklistRenderer = response?.captions?.playerCaptionsTracklistRenderer;
    const captionTracks = playerCaptionsTracklistRenderer?.captionTracks;
  
    if (Array.isArray(captionTracks)) {
        let closeCaptionTrack = [];
        for (const item of captionTracks) {
            if (typeof item?.baseUrl === 'string' && item?.name !== null) {
                closeCaptionTrack.push({
                    baseUrl: item?.baseUrl,
                    text: getTextFromObject(item?.name),
                    languageCode: item?.languageCode,
                });
            }
        }
        ret.closeCaptionTrack = closeCaptionTrack
    }
    
    ret.previewFrames = getFrames(response)
    ret.loginInfo = getLoginInfo(nextResponse)
    // ret.subscribeButtonRenderer = map['subscribeButtonRenderer'] is Map ? SubscribeButtonRenderer.fromMap(map['subscribeButtonRenderer']) : null;
    const contents1 = nextResponse?.contents?.twoColumnWatchNextResults?.results?.results?.contents;

    if (Array.isArray(contents1)) {
        for (const item of contents1) {
            const subscribeButtonRenderer = item?.videoSecondaryInfoRenderer?.subscribeButton?.subscribeButtonRenderer;
            if (subscribeButtonRenderer) {
                ret.subscribeButtonRenderer = subscribeButtonRenderer;
            }
        }
    }

    // ret.dashMpdUrl = map['dashMpdUrl'] ?? '';
    // ret.hlsUrl = map['hlsUrl'] ?? '';
    if (hlsManifestUrl) {
      ret.hlsUrl = hlsManifestUrl;
    } else {
      ret.hlsUrl = getManifestUrl("hls", [iosResponse?.streamingData])
    }
    ret.forceHlsUrl = true;

    let items;
    if (iosResponse?.streamingData) {
      items = [{
        data: iosResponse?.streamingData,
        cpn: iosCpn
      }]
    } else {
      items = [{
        data: playerResponse?.streamingData,
        cpn: html5Cpn
      }]
    }
    // ret.videoStreams = map['videoStreams'] is List ? VideoStream.parseList(map['videoStreams']) : null;
    try {
      ret.videoStreams = await getVideoStreams({items: items, streamType: streamType});
    } catch (e) {
      console.log(e)
    }
    // ret.audioStreams = map['audioStreams'] is List ? AudioStream.parseList(map['audioStreams']) : null;
    try {
      ret.audioStreams = await getAudioStreams({items: items, streamType: streamType});
    } catch (e) {
      console.log(e)
    }
    // ret.videoOnlyStreams = map['videoOnlyStreams'] is List ? VideoStream.parseList(map['videoOnlyStreams']) : null;
    try {
      ret.videoOnlyStreams = await getVideoOnlyStreams({items: items, streamType: streamType});
    } catch (e) {
      console.log(e)
    }

    return ret;
  }

  function getTextFromObject(textObject) {
    if (!textObject) {
      return null;
    }
    if (textObject.simpleText != null) {
      return textObject.simpleText;
    }
    if (textObject.runs == null) {
      return null;
    }
    let textBuilder = '';
    for (const run of textObject.runs) {
      let text = run.text;
      textBuilder += text;
    }
    let text = textBuilder;
    return text;
  }

  function getVideoInfoRenderer(nextResponse, videoRendererName) {
    const contents = nextResponse?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    
    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (item && item[videoRendererName] && item[videoRendererName] != null) {
          return item[videoRendererName];
        }
      }
    }
    
    return null;
  }

  function getVideoPrimaryInfoRenderer(nextResponse) {
    return getVideoInfoRenderer(nextResponse, "videoPrimaryInfoRenderer");
  }

  function getVideoSecondaryInfoRenderer(nextResponse) {
    return getVideoInfoRenderer(nextResponse, "videoSecondaryInfoRenderer");
  }

  function removeNonDigitCharacters(toRemove) {
    return toRemove.replace(/\D+/g, "");
  }

  function parseLikeCountFromLikeButtonViewModel(topLevelButtons) {
    if (!Array.isArray(topLevelButtons)) {
      return null;
    }
    let likeToggleButtonViewModel = null;
    for (const button of topLevelButtons) {
      const mv = button?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel;
      if (mv) {
        likeToggleButtonViewModel = mv;
        break;
      }
    }
    if (!likeToggleButtonViewModel) {
      return null;
    }
    const accessibilityText = likeToggleButtonViewModel.accessibilityText;
    if (!accessibilityText) {
      return null;
    }
    try {
      return parseInt(removeNonDigitCharacters(accessibilityText), 10);
    } catch (e) {
    }
    return null;
  }

  function parseLikeCountFromLikeButtonRenderer(topLevelButtons) {
    if (!Array.isArray(topLevelButtons)) {
      return null;
    }
    let likesString = null;
    let likeToggleButtonRenderer = null;
    for (const button of topLevelButtons) {
      const map = button?.segmentedLikeDislikeButtonRenderer?.likeButton?.toggleButtonRenderer;
      if (map) {
        likeToggleButtonRenderer = map;
        break;
      }
    }
    if (likeToggleButtonRenderer) {
      likesString = likeToggleButtonRenderer?.accessibilityData?.accessibilityData?.label;
      if (!likesString) {
        likesString = likeToggleButtonRenderer?.accessibility?.label;
      }
      if (!likesString) {
        likesString = likeToggleButtonRenderer?.defaultText?.accessibility?.accessibilityData?.label;
      }
      if (likesString && likesString.toLowerCase().includes("no likes")) {
        return 0;
      }
    }
    if (!likesString) {
      return null;
    }
    try {
      return parseInt(removeNonDigitCharacters(likesString), 10);
    } catch (e) {
      return null;
    }
  }

  function getViewCountText(playerResponse, nextResponse) {
    let views = getTextFromObject(getVideoPrimaryInfoRenderer(nextResponse)?.viewCount?.videoViewCountRenderer?.viewCount);
    if (views == null) {
      views = playerResponse?.videoDetails?.viewCount;
    }
    return views;
  }

  function mixedNumberWordToLong(numberWord) {
    if (!numberWord) {
      return null;
    }
  
    let multiplier = '';
    try {
      multiplier = matchGroup(/[\d]+([\.,][\d]+)?\s*([KMBNkmbn])+/i, numberWord, 2) || '';
    } catch (ignored) {
      // Do nothing if the regex fails
    }
  
    const count = parseFloat(
      (matchGroup1(/([\d]+([\.,][\d]+)?)/, numberWord)?.replace(/,/g, '.') || '')
    );
  
    if (isNaN(count)) {
      return null;
    }
  
    switch (multiplier.toUpperCase()) {
      case 'K':
      case 'N':
        return Math.round(count * 1000);
      case 'M':
        return Math.round(count * 1000000);
      case 'B':
        return Math.round(count * 1000000000);
      default:
        return parseInt(removeNonDigitCharacters(numberWord), 10);
    }
  }
  
  function matchGroup(pattern, input, groupIndex) {
    const match = input.match(pattern);
    if (match && match[groupIndex]) {
      return match[groupIndex];
    }
    return null;
  }
  
  function matchGroup1(pattern, input) {
    return matchGroup(pattern, input, 1);
  }

  function getRelatedItems(nextResponse) {
    try {
        let results =
          nextResponse?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results;
    
        if (
          results &&
          results.length === 2 &&
          Array.isArray(results[1]?.itemSectionRenderer?.contents)
        ) {
          results = results[1]?.itemSectionRenderer?.contents;
        }
    
        let ret = []
        for (const result of results || []) {
          if (result.compactVideoRenderer) {
            let item = parseStreamInfoItem(result?.compactVideoRenderer);
            ret.push(item)
          }
        }
    
        return ret;
      } catch (e) {
        console.error(`getRelatedItems ${e}`);
      }
  }

  function parseStreamInfoItem(compactVideoRenderer) {
    let videoInfo = compactVideoRenderer;
    let ret = {};

    let streamType = "VIDEO_STREAM"
    const badges = videoInfo?.badges;
    for (const badge of badges || []) {
        const badgeRenderer = badge?.metadataBadgeRenderer;
        if (
            badgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
            badgeRenderer?.label === "LIVE NOW"
        ) {
            streamType = "LIVE_STREAM";
        }
    }
    for (const overlay of videoInfo?.thumbnailOverlays || []) {
      const style = overlay?.thumbnailOverlayTimeStatusRenderer?.style;
      if ((style?.toUpperCase() || "") === "LIVE") {
          streamType = "LIVE_STREAM";
      }
    }
    ret.streamType = streamType;
    ///
    let videoId = videoInfo?.videoId;
    ret.videoId = videoId;
    ///
    let name = getTextFromObject(videoInfo?.title);
    ret.name = name;
    /// 
    let durationText;
    if (streamType == "LIVE_STREAM") {
        durationText = null;
    } else {
        durationText = getTextFromObject(videoInfo?.lengthText);
    }
    ret.durationText = durationText;
    /// 
    let ownerText = getTextFromObject(videoInfo?.longBylineText);

    if (!ownerText) {
      ownerText = getTextFromObject(videoInfo?.ownerText);
  
      if (!ownerText) {
        ownerText = getTextFromObject(videoInfo?.shortBylineText);
      }
    }
    ret.uploaderName = ownerText;
    /// 
    let uploaderAvatars;
    uploaderAvatars = videoInfo?.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails;
    if (!uploaderAvatars) {
        uploaderAvatars = videoInfo?.channelThumbnail?.thumbnails
    }
    ret.uploaderAvatars = uploaderAvatars
    /// 
    let textualUploadDate;
    textualUploadDate = getTextFromObject(videoInfo?.publishedTimeText)
    if (!textualUploadDate && videoInfo?.videoInfo?.runs) {
        textualUploadDate = videoInfo?.videoInfo
                    ?.runs[2]?.text;
    }
    ret.textualUploadDate = textualUploadDate;
    ret.uploadDate = textualUploadDate;
    /// 
    let thumbnails = videoInfo?.thumbnail?.thumbnails;
    ret.thumbnails = thumbnails;
    ///
    let viewCountText;
    viewCountText = getTextFromObject(videoInfo?.viewCountText);
    if (!viewCountText) {
        if (videoInfo?.shortViewCountText != null) {
            let shortViewCountText = getTextFromObject(videoInfo?.shortViewCountText);
            if (shortViewCountText != null) {
                viewCountText = shortViewCountText;
            }
        }
    }
    ret.viewCountText = viewCountText;
    if (viewCountText) {
      try {
        ret.viewCount = parseInt(removeNonDigitCharacters(viewCountText), 10);
      } catch (e) {
      }
    }
    ///
    let shortDescription;
    if (videoInfo?.detailedMetadataSnippets != null) {
        shortDescription = getTextFromObject(videoInfo?.detailedMetadataSnippets[0]?.snippetText);
    }
    if (!shortDescription) {
        if (videoInfo?.descriptionSnippet) {
            shortDescription = getTextFromObject(videoInfo?.descriptionSnippet);
        }
    }
    ret.shortDescription = shortDescription;
    // 
    let isLiveStream = false;
    if (Array.isArray(videoInfo?.badges)) {
      for (const item of videoInfo?.badges ?? []) {
        if (item?.metadataBadgeRenderer?.icon?.iconType === "LIVE") {
          isLiveStream = true;
        }
      }
    }
    
    if (Array.isArray(videoInfo?.thumbnailOverlays)) {
      for (const item of videoInfo?.thumbnailOverlays ?? []) {
        if (item?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE") {
          isLiveStream = true;
        }
      }
    }
    ret.isLiveStream = isLiveStream;
    return ret;
}

function getFrames(playerResponse) {
    try {
      const storyboards = playerResponse?.storyboards;
      const storyboardsRenderer = storyboards?.[
        storyboards?.playerLiveStoryboardSpecRenderer != null
          ? 'playerLiveStoryboardSpecRenderer'
          : 'playerStoryboardSpecRenderer'
      ];
      if (!storyboardsRenderer) {
        return [];
      }
      const storyboardsRendererSpec = storyboardsRenderer.spec;
      if (!storyboardsRendererSpec) {
        return [];
      }
      const spec = storyboardsRendererSpec.split('|');
      const url = spec[0];
      const result = [];
      for (let i = 1; i < spec.length; ++i) {
        const parts = spec[i].split('#');
        if (parts.length !== 8 || parseInt(parts[5], 10) === 0) {
          continue;
        }
        const totalCount = parseInt(parts[2], 10);
        const framesPerPageX = parseInt(parts[3], 10);
        const framesPerPageY = parseInt(parts[4], 10);
        if (isNaN(totalCount) || isNaN(framesPerPageX) || isNaN(framesPerPageY)) {
          continue;
        }
        const baseUrl = `${url.replace('$L', (i - 1).toString())
          .replace('$N', parts[6])}&sigh=${parts[7]}`;
        let urls = [];
        if (baseUrl.includes('$M')) {
          const totalPages = Math.ceil(totalCount / (framesPerPageX * framesPerPageY));
          for (let j = 0; j < totalPages; j++) {
            urls.push(baseUrl.replace('$M', j.toString()));
          }
        } else {
          urls = [baseUrl];
        }
        result.push({
          urls: urls,
          frameWidth: parseInt(parts[0], 10),
          frameHeight: parseInt(parts[1], 10),
          totalCount: totalCount,
          durationPerFrame: parseInt(parts[5], 10),
          framesPerPageX: framesPerPageX,
          framesPerPageY: framesPerPageY
        });
      }
      return result;
    } catch (e) {
      console.log(`Could not get frames: ${e}`);
    }
    return null;
  }

  function getLoginInfo(nextResponse) {
    const frameworkUpdates = nextResponse?.frameworkUpdates;
    const entityBatchUpdate = frameworkUpdates?.entityBatchUpdate;
    const mutations = entityBatchUpdate?.mutations;
  
    if (Array.isArray(mutations) && mutations.length > 0) {
      const ret = {};
      mutations.forEach(item => {
        const payload = item?.payload;
        const likeStatusEntity = payload?.likeStatusEntity;
        const subscriptionStateEntity = payload?.subscriptionStateEntity;
        if (likeStatusEntity?.likeStatus && typeof likeStatusEntity.likeStatus === 'string') {
          ret.likeStatus = likeStatusEntity.likeStatus;
        } else if (subscriptionStateEntity?.subscribed !== undefined && typeof subscriptionStateEntity.subscribed === 'boolean') {
          ret.subscribed = subscriptionStateEntity.subscribed;
        }
      });
      return ret;
    }
    return null;
  }

  function getManifestUrl(manifestType, streamingDataObjects) {
    const manifestKey = `${manifestType}ManifestUrl`;
    for (const value of streamingDataObjects) {
      if (value && typeof value[manifestKey] === 'string') {
        return value[manifestKey];
      }
    }
    return '';
  }

  const ITAG_LIST = [
    // VIDEO     ID  Type   Format  Resolution  FPS  ////
    {id: 17, itagType: "VIDEO", mediaFormat: "v3GPP", resolutionString: "144p"},
    {id: 36, itagType: "VIDEO", mediaFormat: "v3GPP", resolutionString: "240p"},

    {id: 18, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "360p"},
    {id: 34, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "360p"},
    {id: 35, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 59, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 78, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 22, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "720p"},
    {id: 37, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "1080p"},
    {id: 38, itagType: "VIDEO", mediaFormat: "MPEG_4", resolutionString: "1080p"},

    {id: 43, itagType: "VIDEO", mediaFormat: "WEBM", resolutionString: "360p"},
    {id: 44, itagType: "VIDEO", mediaFormat: "WEBM", resolutionString: "480p"},
    {id: 45, itagType: "VIDEO", mediaFormat: "WEBM", resolutionString: "720p"},
    {id: 46, itagType: "VIDEO", mediaFormat: "WEBM", resolutionString: "1080p"},

    // AUDIO     id: ID   type:    ItagType          Format        Bitrate    //
    {id: 171, itagType: "AUDIO", mediaFormat: "WEBMA", avgBitrate: 128},
    {id: 172, itagType: "AUDIO", mediaFormat: "WEBMA", avgBitrate: 256},
    {id: 599, itagType: "AUDIO", mediaFormat: "M4A", avgBitrate: 32},
    {id: 139, itagType: "AUDIO", mediaFormat: "M4A", avgBitrate: 48},
    {id: 140, itagType: "AUDIO", mediaFormat: "M4A", avgBitrate: 128},
    {id: 141, itagType: "AUDIO", mediaFormat: "M4A", avgBitrate: 256},
    {id: 600, itagType: "AUDIO", mediaFormat: "WEBMA_OPUS", avgBitrate: 35},
    {id: 249, itagType: "AUDIO", mediaFormat: "WEBMA_OPUS", avgBitrate: 50},
    {id: 250, itagType: "AUDIO", mediaFormat: "WEBMA_OPUS", avgBitrate: 70},
    {id: 251, itagType: "AUDIO", mediaFormat: "WEBMA_OPUS", avgBitrate: 160},

    /// VIDEO ONLid: Y // type: /////////////////////////////////////////
    {id: 160, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "144p"},
    {id: 394, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "144p"},
    {id: 133, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "240p"},
    {id: 395, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "240p"},
    {id: 134, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "360p"},
    {id: 396, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "360p"},
    {id: 135, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 212, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 397, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "480p"},
    {id: 136, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "720p"},
    {id: 398, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "720p"},
    {id: 298, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "720p60", fps: 60},
    {id: 137, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "1080p"},
    {id: 399, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "1080p"},
    {id: 299, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "1080p60", fps: 60},
    {id: 400, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "1440p"},
    {id: 266, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "2160p"},
    {id: 401, itagType: "VIDEO_ONLY", mediaFormat: "MPEG_4", resolutionString: "2160p"},

    {id: 278, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "144p"},
    {id: 242, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "240p"},
    {id: 243, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "360p"},
    {id: 244, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "480p"},
    {id: 245, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "480p"},
    {id: 246, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "480p"},
    {id: 247, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "720p"},
    {id: 248, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "1080p"},
    {id: 271, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "1440p"},
    // #272 is either type: 3840x2160 (e.g. RtoitU2A-3E) or 7680x4320 (sLprVF6d7Ug)
    {id: 272, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "2160p"},
    {id: 302, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "720p60", fps: 60},
    {id: 303, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "1080p60", fps: 60},
    {id: 308, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "1440p60", fps: 60},
    {id: 313, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "2160p"},
    {id: 315, itagType: "VIDEO_ONLY", mediaFormat: "WEBM", resolutionString: "2160p60", fps: 60}
  ];

  const MEDIAFOMAT_LIST = [
    {"code": "MPEG_4", "id": 0x0, "name": "MPEG-4", "suffix": "mp4", "mimeType": "video/mp4"},
    {"code": "v3GPP", "id": 0x10, "name": "3GPP", "suffix": "3gp", "mimeType": "video/3gpp"},
    {"code": "WEBM", "id": 0x20, "name": "WebM", "suffix": "webm", "mimeType": "video/webm"},
    {"code": "M4A", "id": 0x100, "name": "m4a", "suffix": "m4a", "mimeType": "audio/mp4"},
    {"code": "WEBMA", "id": 0x200, "name": "WebM", "suffix": "webm", "mimeType": "audio/webm"},
    {"code": "MP3", "id": 0x300, "name": "MP3", "suffix": "mp3", "mimeType": "audio/mpeg"},
    {"code": "MP2", "id": 0x310, "name": "MP2", "suffix": "mp2", "mimeType": "audio/mpeg"},
    {"code": "OPUS", "id": 0x400, "name": "opus", "suffix": "opus", "mimeType": "audio/opus"},
    {"code": "OGG", "id": 0x500, "name": "ogg", "suffix": "ogg", "mimeType": "audio/ogg"},
    {"code": "WEBMA_OPUS", "id": 0x200, "name": "WebM Opus", "suffix": "webm", "mimeType": "audio/webm"},
    {"code": "AIFF", "id": 0x600, "name": "AIFF", "suffix": "aiff", "mimeType": "audio/aiff"},
    {"code": "AIF", "id": 0x600, "name": "AIFF", "suffix": "aif", "mimeType": "audio/aiff"},
    {"code": "WAV", "id": 0x700, "name": "WAV", "suffix": "wav", "mimeType": "audio/wav"},
    {"code": "FLAC", "id": 0x800, "name": "FLAC", "suffix": "flac", "mimeType": "audio/flac"},
    {"code": "ALAC", "id": 0x900, "name": "ALAC", "suffix": "alac", "mimeType": "audio/alac"},
    {"code": "VTT", "id": 0x1000, "name": "WebVTT", "suffix": "vtt", "mimeType": "text/vtt"},
    {"code": "TTML", "id": 0x2000, "name": "Timed Text Markup Language", "suffix": "ttml", "mimeType": "application/ttml+xml"},
    {"code": "TRANSCRIPT1", "id": 0x3000, "name": "TranScript v1", "suffix": "srv1", "mimeType": "text/xml"},
    {"code": "TRANSCRIPT2", "id": 0x4000, "name": "TranScript v2", "suffix": "srv2", "mimeType": "text/xml"},
    {"code": "TRANSCRIPT3", "id": 0x5000, "name": "TranScript v3", "suffix": "srv3", "mimeType": "text/xml"},
    {"code": "SRT", "id": 0x6000, "name": "SubRip file format", "suffix": "srt", "mimeType": "text/srt"}
  ];

  function getMediaformatByCode(code) {
    for (const item of MEDIAFOMAT_LIST) {
      if (code === item.code) {
        return item;
      }
    }
    return null
  }

  function isItagSupported(itag) {
    for (const item of ITAG_LIST) {
      if (itag === item.id) {
        return true;
      }
    }
    return false;
  }
  
  function getItagItemFromId(itagId) {
    for (const item of ITAG_LIST) {
      if (itagId === item.id) {
        return { ...item };
      }
    }
    return null;
  }

  async function getAudioStreams({items, streamType}) {
    return getStreamFromItags({items: items, streamingDataKey: "adaptiveFormats", itagTypeWanted: "AUDIO", streamBuilderHelper: getAudioStreamBuilderHelper({streamType: streamType}), message: "audio", streamType: streamType});
  }
  
  async function getVideoStreams({items, streamType}) {
    return getStreamFromItags({items: items, streamingDataKey: "formats", itagTypeWanted: "VIDEO", streamBuilderHelper: getVideoStreamBuilderHelper({isVideoOnly:false, streamType: streamType}), message: "video", streamType: streamType});
  }
  
  async function getVideoOnlyStreams({items, streamType}) {
    return getStreamFromItags({items: items, streamingDataKey:"adaptiveFormats", itagTypeWanted: "VIDEO_ONLY", streamBuilderHelper: getVideoStreamBuilderHelper({isVideoOnly:true, streamType: streamType}), message: "video-only", streamType: streamType});
  }

  function getAudioStreamBuilderHelper({streamType}) {
    return function (itagInfo) {
      const itagItem = itagInfo.itagItem;
      const audioStream = {};
  
      audioStream.id = itagItem?.id?.toString();
      audioStream.content = itagInfo.content;
      audioStream.mediaFormat = getMediaformatByCode(itagItem?.mediaFormat);
      audioStream.averageBitrate = itagItem?.avgBitrate;
      audioStream.audioTrackId = itagItem?.audioTrackId;
      audioStream.audioTrackName = itagItem?.audioTrackName;
      audioStream.audioTrackType = itagItem?.audioTrackType;
      audioStream.itagItem = itagItem;
      if (
        streamType === "LIVE_STREAM" ||
        streamType === "POST_LIVE_STREAM" ||
        itagInfo.isUrl === false
      ) {
        audioStream.deliveryMethod = "DASH";
      }
      return audioStream;
    };
  }  

  function getVideoStreamBuilderHelper({isVideoOnly, streamType}) {
    return function (itagInfo) {
      const itagItem = itagInfo.itagItem;
      const videoStream = {};
  
      videoStream.id = itagItem?.id?.toString();
      videoStream.content = itagInfo.content;
      videoStream.isUrl = itagInfo.isUrl;
      videoStream.mediaFormat = getMediaformatByCode(itagItem?.mediaFormat);
      videoStream.isVideoOnly = isVideoOnly;
      videoStream.itagItem = itagItem;
  
      const resolutionString = itagItem?.resolutionString || '';
      videoStream.resolution = resolutionString;
  
      if (
        streamType !== "VIDEO_STREAM" ||
        itagInfo.isUrl === false
      ) {
        videoStream.deliveryMethod = "DASH";
      }
  
      return videoStream;
    };
  }

  async function getStreamFromItags({items, streamingDataKey, itagTypeWanted, streamBuilderHelper, message, streamType}) {
    const streamList = [];
    try {
      for (const item of items) {
        const tags = await getStreamsFromStreamingDataKey({streamingData: item.data, streamingDataKey: streamingDataKey, itagTypeWanted: itagTypeWanted, contentPlaybackNonce: item.cpn, streamType: streamType});
        for (const value of tags) {
          const stream = streamBuilderHelper(value);
          streamList.push(stream);
        }
      }
    } catch (e) {
    }
    return streamList;
  }

  async function getStreamsFromStreamingDataKey({streamingData, streamingDataKey, itagTypeWanted, contentPlaybackNonce, streamType}) {
    if (!streamingData || !streamingData[streamingDataKey]) {
      return [];
    }
  
    const ret = [];
    const data = streamingData[streamingDataKey];
  
    if (Array.isArray(data)) {
      for (const formatData of data) {
        const itagItem = getItagItemFromId(formatData.itag);
        if (itagItem) {
          if (itagItem.itagType === itagTypeWanted) {
            try {
              const itagInfo = await buildAndAddItagInfoToList({formatData: formatData, itagItem: itagItem, itagType: itagItem.itagType, contentPlaybackNonce: contentPlaybackNonce, streamType: streamType});
              ret.push(itagInfo);
            } catch (e) {
              print('getStreamsFromStreamingDataKey error', e);
            }
          }
        }
      }
    }
  
    return ret;
  }

  async function buildAndAddItagInfoToList({formatData, itagItem, itagType, contentPlaybackNonce, streamType}) {
    let streamUrl;
    let cipher;
  
    if (formatData.url) {
      streamUrl = formatData.url;
    } else {
      // This url has an obfuscated signature
      const cipherString = formatData["cipher"] || formatData["signatureCipher"];
      cipher = compatParseMap(cipherString);
      const signature = await deobfuscateSignature(cipher.s);
      streamUrl = `${cipher.url}&${cipher.sp}=${signature}`;
    }
  
    // Add the content playback nonce to the stream URL
    streamUrl += `&cpn=${contentPlaybackNonce}`;
  
    // Decrypt the n parameter if it is present
    // streamUrl = await tryDeobfuscateThrottlingParameterOfUrl(streamUrl, videoId);
  
    const initRange = formatData.initRange;
    const indexRange = formatData.indexRange;
    const mimeType = formatData.mimeType || '';
    const codec = mimeType.includes("codecs") ? mimeType.split('"')[1] : '';
  
    itagItem.bitrate = formatData.bitrate;
    itagItem.width = formatData.width;
    itagItem.height = formatData.height;
    itagItem.initStart = parseInt(initRange?.start || "-1", 10);
    itagItem.initEnd = parseInt(initRange?.end || "-1", 10);
    itagItem.indexStart = parseInt(indexRange?.start || "-1", 10);
    itagItem.indexEnd = parseInt(indexRange?.end || "-1", 10);
    itagItem.quality = formatData.quality;
    itagItem.codec = codec;
  
    itagItem.targetDurationSec = formatData.targetDurationSec;
  
    if (itagType === "VIDEO" || itagType === "VIDEO_ONLY") {
      itagItem.fps = formatData.fps;
    } else if (itagType === "AUDIO") {
      // YouTube returns the audio sample rate as a string
      itagItem.sampleRate = parseInt(formatData.audioSampleRate || '-1', 10);
      itagItem.audioChannels = formatData.audioChannels || 2;
  
      itagItem.audioTrackId = formatData.audioTrack?.id;
  
      itagItem.audioTrackName = formatData.audioTrack?.displayName;
    }
  
    // YouTube returns the content length and the approximate duration as strings
    itagItem.contentLength = parseInt(formatData.contentLength || '0', 10);
    itagItem.approxDurationMs = parseInt(formatData.approxDurationMs || '0', 10);
  
    const itagInfo = {
      content: streamUrl,
      itagItem: itagItem
    };
  
    if (streamType === "VIDEO_STREAM") {
      itagInfo.isUrl = (formatData.type || "") !== "FORMAT_STREAM_TYPE_OTF";
    } else {
      itagInfo.isUrl = (streamType !== "POST_LIVE_STREAM");
    }
    return itagInfo;
  }

  function compatParseMap(input) {
    const map = {};
    input.split("&").forEach(arg => {
      const splitArg = arg.split("=");
      if (splitArg.length > 1) {
        map[splitArg[0]] = decodeURIComponent(splitArg[1]);
      } else {
        map[splitArg[0]] = "";
      }
    });
    return map;
  }

  async function deobfuscateSignature(obfuscatedSignature) {
    await extractJavaScriptCodeIfNeeded();
    if (!cachedSignatureDeobfuscationFunction) {
      try {
        cachedSignatureDeobfuscationFunction = getDeobfuscationCode(cachedJavaScriptPlayerCode);
      } catch (e) {
        print("JS getDeobfuscationCode error", e);
      }
    }
    // Get the function from the server if it's not cached
    if (!cachedSignatureDeobfuscationFunction) {
      print("JS cachedSignatureDeobfuscationFunction == null");
      return null;
    }
    try {
      let DEOBFUSCATION_FUNCTION_NAME = "deobfuscate";
      const result = runJsFunction(
        cachedSignatureDeobfuscationFunction,
        DEOBFUSCATION_FUNCTION_NAME,
        obfuscatedSignature
      );
      return result;
    } catch (e) {
      print("JS deobfuscateSignature error ", e);
    }
    return null;
  }

  function getDeobfuscationCode(javaScriptPlayerCode) {
    try {
      const deobfuscationFunctionName = getDeobfuscationFunctionName(javaScriptPlayerCode);
      if (deobfuscationFunctionName == null) {
        print("JS deobfuscationFunctionName == null");
        return null;
      }
  
      let deobfuscationFunction;
      try {
        deobfuscationFunction = getDeobfuscateFunctionWithRegex(javaScriptPlayerCode, deobfuscationFunctionName);
      } catch (e) {
        print("JS deobfuscationFunction error ", e);
      }
  
      if (deobfuscationFunction == null) {
        print("JS deobfuscationFunction == null");
        return null;
      }
  
      // Assert the extracted deobfuscation function is valid
      const SIG_DEOBF_HELPER_OBJ_NAME_REGEX = /;([A-Za-z0-9_$]{2,})\...\(/;
      const helperObjectName = matchGroup1(SIG_DEOBF_HELPER_OBJ_NAME_REGEX, deobfuscationFunction);
      if (helperObjectName == null) {
        print("JS helperObjectName == null");
        return null;
      }
  
      const helperObject = getHelperObject(javaScriptPlayerCode, helperObjectName);
      if (helperObject == null) {
        print("JS helperObject == null");
        return null;
      }
      let DEOBFUSCATION_FUNCTION_NAME = "deobfuscate";
      const callerFunction = `function ${DEOBFUSCATION_FUNCTION_NAME}(a){return ${deobfuscationFunctionName}(a);}`;
      return helperObject + deobfuscationFunction + ";" + callerFunction;
    } catch (e) {
      print("JS Could not parse deobfuscation",e);
    }
  }
  
  function getDeobfuscationFunctionName(javaScriptPlayerCode) {
    const FUNCTION_REGEXES = [
        /\bm=([a-zA-Z0-9\$]{2,})\(decodeURIComponent\(h\.s\)\)/,
        /\bc&&\(c=([a-zA-Z0-9\$]{2,})\(decodeURIComponent\(c\)\)/,
        // CHECKSTYLE:OFF
        /(?:\b|[^a-zA-Z0-9\$])([a-zA-Z0-9\$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
        // CHECKSTYLE:ON
        /([\w\$]+)\s*=\s*function\((\w+)\)\{\s*\2=\s*\2\.split\(""\)\s*;/,
      ];
    for (const regex of FUNCTION_REGEXES) {
      try {
        const match = javaScriptPlayerCode.match(regex);
        if (match) {
          return match[1];
        }
      } catch (e) {
        print("JS getDeobfuscationFunctionName error ", e)
      }
    }
    return null;
  }
  
  function getDeobfuscateFunctionWithRegex(javaScriptPlayerCode, deobfuscationFunctionName) {
    const DEOBF_FUNC_REGEX_START = '(';
    const DEOBF_FUNC_REGEX_END = '=function\\([a-zA-Z0-9_]+\\)\\{.+?\\})';
    const functionPattern = DEOBF_FUNC_REGEX_START + deobfuscationFunctionName + DEOBF_FUNC_REGEX_END;
    const regex = new RegExp(functionPattern);
    const match = javaScriptPlayerCode.match(regex);
    if (match && match[1]) {
      return `var ${match[1]}`;
    }
    return null;
  }
  
  function getHelperObject(javaScriptPlayerCode, helperObjectName) {
    const SIG_DEOBF_HELPER_OBJ_REGEX_START = '(var ';
    const SIG_DEOBF_HELPER_OBJ_REGEX_END = '=\\{(?:.|\\n)+?\\}\\};)';
    const helperPattern = SIG_DEOBF_HELPER_OBJ_REGEX_START
      + helperObjectName
      + SIG_DEOBF_HELPER_OBJ_REGEX_END;
    const regex = new RegExp(helperPattern);
    const match = javaScriptPlayerCode.match(regex);
    if (match) {
      return match[0].replace(/\n/g, '');
    }
    return null;
  }

  function runJsFunction(functionCode, functionName, parameters) {
    let code;
    if (typeof getYoutubeStreamData == "function") {
        code = `${functionCode}; ${functionName}("${parameters}")`;
    } else {
        code = `${functionName}("${parameters}")`;
    }
    try {
      const res = eval(code);
      return res;
    } catch (e) {
      print("runJsFunction error", e)
    }
    return null;
  }

async function getYoutubeVisitorDataForHls() {
    let res = await httpGet('https://www.youtube.com/', {
      'Host': 'www.youtube.com',
      'accept': '*/*',
      'origin': 'https://www.youtube.com',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15',
    });
    let txtBody = getTextBody(res);
    const regExp = /"visitorData":\s*"([^"]+)"/;
    const match = txtBody.match(regExp);
    if (match) {
      youtubeVisitorId = match[1];
      print(`Extracted visitorData: `, youtubeVisitorId);
    } else {
      print('No match visitorData found');
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getYoutubeStreamData };
}