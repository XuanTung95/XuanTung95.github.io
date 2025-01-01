let cachedJavaScriptPlayerCode = null;
let cachedSignatureTimestamp = null;
let globalInfo = null;

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
    } else {
        if (globalInfo == null) {
            globalInfo = getDefaultGlobalInfo()
        }
    }
    let hlsManifestUrl = await getHlsManifestUrl(videoId);

    let html5Cpn = generateContentPlaybackNonce()
    console.log("html5Cpn", html5Cpn);
    let sts = await getSignatureTimestamp();
    console.log("getSignatureTimestamp", sts);
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

    console.log("playerRes", playerResponse);
    console.log("nextResponse", nextResponse);
    console.log("iosResponse", iosResponse);
    let data = await extractStreamData({
        playerResponse: playerResponse,
        nextResponse: nextResponse,
        iosResponse: iosResponse,
        videoId: videoId,
    });
    if (data) {
        data.cpn = html5Cpn;
    }
    if (data.id == videoId) {
        return JSON.stringify(data);
    } else {
        return "";
    }
}

async function getHlsManifestUrl(videoId) {
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
        let cookie = getCookieString();
        if (cookie != null && cookie != '' && globalInfo?.useCookieForHls == true) {
            headers['Cookie'] = cookie;
        }
        if (globalInfo?.useVisitorIdForHls == true) {
            headers['x-goog-visitor-id'] = getVisitorId();
        }
        let text = await httpGetText(path, headers);
        if (text != null && (typeof text === "string")) {
            const html = text;
            const str1 = '"hlsManifestUrl":"';
            const str2 = '.m3u8",';
            let idx1 = html.indexOf(str1);
            console.log("idx1", idx1);
            console.log("body", html.indexOf("body"));
            if (idx1 >= 0) {
              idx1 += str1.length;
              const idx2 = html.indexOf(str2, idx1);
              console.log("idx2", idx2);
              if (idx2 >= 0) {
                const url = html.substring(idx1, idx2 + str2.length - 2);
                let hlsManifestUrl = url;
                return hlsManifestUrl;
              }
            }
        }
    } catch (e) {
        console.log(e);
    }
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
        console.error(`Could not fetch IFrame resource: ${e}`);
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
        console.error(`IFrame resource didn't provide JavaScript base player's hash: ${e}`);
    }

    return null;
}

async function extractJavaScriptCodeIfNeeded() {
    if (!cachedJavaScriptPlayerCode) {
        cachedJavaScriptPlayerCode = await extractJavaScriptPlayerCode();
    }
    return cachedJavaScriptPlayerCode;
}

async function extractJavaScriptPlayerCode() {
    let url = null;
    try {
      url = await extractJavaScriptUrlWithIframeResource();
      console.log("url", url)
      if (url == null) {
        return null;
      }
      let playerJsUrl = cleanJavaScriptUrl(url);

      // Assert that the URL we extracted and built is valid

      let code = await downloadJavaScriptCode(playerJsUrl);
      return code;
    } catch (e) {
      console.log('extractJavaScriptPlayerCode', e);
    }
    return null;
  }

  function cleanJavaScriptUrl(javaScriptPlayerUrl) {
    if (javaScriptPlayerUrl.startsWith("//")) {
      // Add "https:" for protocol-relative URLs
      return `https:${javaScriptPlayerUrl}`;
    } else if (javaScriptPlayerUrl.startsWith("/")) {
      // Add "https://www.youtube.com" for URLs relative to YouTube's domain
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
      console.log("Could not get JavaScript base player's code", e);
    }
    return null;
  }

  async function getSignatureTimestamp() {
    // Return the cached result if it is present
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
            console.log("No match found.");
        }
        }
    } catch (e) {
        console.log("getSignatureTimestamp", e);
    }
    console.log("getSignatureTimestamp", cachedSignatureTimestamp);
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
  
    // Add visitorData only if it's not null
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
  
    // Conditionally add "enableSafetyMode" if GlobalInfo.instance.enableSafetyMode is true
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
  
    // Conditionally add "visitorData" if it exists
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
    const headers = getClientInfoHeaders(forceVisitorData);
    return headers;
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
    playerResponse, nextResponse, iosResponse, videoId
  }) {
    let ret = {};
    let response = playerResponse;
    if (response == null) {
        response = iosResponse;
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
    let views = getTextFromObject(getVideoPrimaryInfoRenderer()?.viewCount?.videoViewCountRenderer?.viewCount);
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
        let topLevelButtons = getVideoPrimaryInfoRenderer()?.videoActions?.menuRenderer?.topLevelButtons;
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
    ret.getViewCountText = getViewCountText(response, nextResponse);

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
    ret.hlsUrl = getManifestUrl("hls", [iosResponse?.streamingData])
    ret.forceHlsUrl = true;
    // ret.videoStreams = map['videoStreams'] is List ? VideoStream.parseList(map['videoStreams']) : null;
    // ret.audioStreams = map['audioStreams'] is List ? AudioStream.parseList(map['audioStreams']) : null;
    // ret.videoOnlyStreams = map['videoOnlyStreams'] is List ? VideoStream.parseList(map['videoOnlyStreams']) : null;

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
    /////////////////////////////////////////////////////
    // VIDEO     ID  Type   Format  Resolution  FPS  ////
    /////////////////////////////////////////////////////
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

    /////////////id: //// type: ////////////////////////////////////////////////
    // AUDIO     id: ID   type:    ItagType          Format        Bitrate    //
    /////////////id: //// type: ////////////////////////////////////////////////
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
    //           id: ID   type:    Type     Format  Resolution  FPS  ////
    /////////////id: //// type: /////////////////////////////////////////
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

  async function getStreamFromItags(items, streamingDataKey, itagTypeWanted, streamBuilderHelper, streamTypeExceptionMessage) {
    const streamList = [];
    try {
      for (const item of items) {
        const tags = await getStreamsFromStreamingDataKey(videoId, item.o1, streamingDataKey, itagTypeWanted, item.o2);
        for (const value of tags) {
          const stream = streamBuilderHelper(value);
          streamList.push(stream);
        }
      }
    } catch (e) {
    }
    return streamList;
  }

  async function getStreamsFromStreamingDataKey(videoId, streamingData, streamingDataKey, itagTypeWanted, contentPlaybackNonce) {
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
              const itagInfo = await buildAndAddItagInfoToList(videoId, formatData, itagItem, itagItem.itagType, contentPlaybackNonce);
              ret.push(itagInfo);
            } catch (e) {
              console.log(`getStreamsFromStreamingDataKey: ${e}`);
            }
          }
        }
      }
    }
  
    return ret;
  }

  async function buildAndAddItagInfoToList(videoId, formatData, itagItem, itagType, contentPlaybackNonce, tempInfo) {
    let streamUrl;
    let cipher;
  
    if (formatData.url) {
      streamUrl = formatData.url;
    } else {
      // This url has an obfuscated signature
      const cipherString = formatData["cipher"] || formatData["signatureCipher"];
      cipher = compatParseMap(cipherString);
      const signature = tempInfo?.signatureMap[cipher.s] || await deobfuscateSignature(videoId, cipher.s);
      streamUrl = `${cipher.url}&${cipher.sp}=${signature}`;
    }
  
    // Add the content playback nonce to the stream URL
    streamUrl += `&cpn=${contentPlaybackNonce}`;
  
    // Decrypt the n parameter if it is present
    streamUrl = await tryDeobfuscateThrottlingParameterOfUrl(streamUrl, videoId);
  
    const initRange = formatData.initRange;
    const indexRange = formatData.indexRange;
    const mimeType = formatData.mimeType || '';
    const codec = mimeType.includes("codecs") ? mimeType.split('"')[1] : '';
  
    itagItem.bitrate = formatData.bitrate;
    itagItem.width = formatData.width;
    itagItem.height = formatData.height;
    itagItem.initStart = parseInt(initRange?.start || "-1");
    itagItem.initEnd = parseInt(initRange?.end || "-1");
    itagItem.indexStart = parseInt(indexRange?.start || "-1");
    itagItem.indexEnd = parseInt(indexRange?.end || "-1");
    itagItem.quality = formatData.quality;
    itagItem.codec = codec;
  
    if (streamType === StreamType.LIVE_STREAM || streamType === StreamType.POST_LIVE_STREAM) {
      itagItem.targetDurationSec = formatData.targetDurationSec;
    }
  
    if (itagType === ItagType.VIDEO || itagType === ItagType.VIDEO_ONLY) {
      itagItem.fps = formatData.fps;
    } else if (itagType === ItagType.AUDIO) {
      // YouTube returns the audio sample rate as a string
      itagItem.sampleRate = parseInt(formatData.audioSampleRate || '-1');
      itagItem.audioChannels = formatData.audioChannels || 2;
  
      const audioTrackId = formatData.audioTrack?.id;
      if (audioTrackId) {
        itagItem.audioTrackId = audioTrackId;
        const audioTrackIdLastLocaleCharacter = audioTrackId.indexOf(".");
        if (audioTrackIdLastLocaleCharacter !== -1) {
          // Audio tracks IDs are in the form LANGUAGE_CODE.TRACK_NUMBER
          // LocaleCompat.forLanguageTag(
          //   audioTrackId.substring(0, audioTrackIdLastLocaleCharacter)
          // ).ifPresent(itagItem::setAudioLocale);
        }
        // itagItem.audioTrackType(YoutubeParsingHelper.extractAudioTrackType(streamUrl));
      }
  
      itagItem.audioTrackName = formatData.audioTrack?.displayName;
    }
  
    // YouTube returns the content length and the approximate duration as strings
    itagItem.contentLength = parseInt(formatData.contentLength || '');
    itagItem.approxDurationMs = parseInt(formatData.approxDurationMs || '');
  
    const itagInfo = new ItagInfo({
      content: streamUrl,
      itagItem: itagItem
    });
  
    if (streamType === StreamType.VIDEO_STREAM) {
      itagInfo.isUrl = (formatData.type || "") !== "FORMAT_STREAM_TYPE_OTF";
    } else {
      // We are currently not able to generate DASH manifests for running
      // livestreams, so because of the requirements of StreamInfo
      // objects, return these streams as DASH URL streams (even if they
      // are not playable).
      // Ended livestreams are returned as non-URL streams
      itagInfo.isUrl = (streamType !== StreamType.POST_LIVE_STREAM);
    }
  
    return itagInfo;
  }

  function compatParseMap(input) {
    const map = {};
    const args = input.split("&");
  
    args.forEach(arg => {
      const splitArg = arg.split("=");
      if (splitArg.length > 1) {
        map[splitArg[0]] = decodeUrlUtf8(splitArg[1]);
      } else {
        map[splitArg[0]] = "";
      }
    });
  
    return map;
  }

  async function deobfuscateSignature(obfuscatedSignature) {
    // If the signature deobfuscation function has been not extracted previously,
    // this means we will fail to extract it on next calls too if the player code has not changed.
    // We can optimize performance by checking if the extraction exception has occurred.
    if (sigDeobFuncExtractionEx !== null) {
      return null;
    }
  
    await extractJavaScriptCodeIfNeeded();
  
    if (!cachedSignatureDeobfuscationFunction) {
      try {
        cachedSignatureDeobfuscationFunction = getDeobfuscationCode(cachedJavaScriptPlayerCode);
      } catch (e) {
      }
    }
  
    if (!cachedSignatureDeobfuscationFunction) {
      // Get the function from the server if it's not cached
    }
  
    if (!cachedSignatureDeobfuscationFunction) {
      return null;
    }
  
    try {
      // Run the deobfuscation function and return the result
      let DEOBFUSCATION_FUNCTION_NAME = "deobfuscate";
      const result = runJsFunction(
        cachedSignatureDeobfuscationFunction,
        DEOBFUSCATION_FUNCTION_NAME,
        obfuscatedSignature
      );
      return result;
    } catch (e) {
      // Handle error if the function can't be run, though this shouldn't normally happen
      // throw new ParsingException("Could not run signature parameter deobfuscation JavaScript function", e);
    }
    return null;
  }

  function getDeobfuscationCode(javaScriptPlayerCode) {
    try {
      const deobfuscationFunctionName = getDeobfuscationFunctionName(javaScriptPlayerCode);
      if (deobfuscationFunctionName == null) {
        return null;
      }
  
      let deobfuscationFunction;
      try {
        deobfuscationFunction = getDeobfuscateFunctionWithRegex(javaScriptPlayerCode, deobfuscationFunctionName);
      } catch (e) {
        // Handle error
      }
  
      if (deobfuscationFunction == null) {
        return null;
      }
  
      // Assert the extracted deobfuscation function is valid
      const SIG_DEOBF_HELPER_OBJ_NAME_REGEX = /;([A-Za-z0-9_$]{2,})\...\(/;

      const helperObjectName = matchGroup1(SIG_DEOBF_HELPER_OBJ_NAME_REGEX, deobfuscationFunction);
      if (helperObjectName == null) {
        return null;
      }
  
      const helperObject = getHelperObject(javaScriptPlayerCode, helperObjectName);
      if (helperObject == null) {
        return null;
      }
      let DEOBFUSCATION_FUNCTION_NAME = "deobfuscate";
      const callerFunction = `function ${DEOBFUSCATION_FUNCTION_NAME}(a){return ${deobfuscationFunctionName}(a);}`;
  
      return helperObject + deobfuscationFunction + ";" + callerFunction;
    } catch (e) {
      // Handle error: Could not parse deobfuscation function
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
        
      }
    }
    return null;
  }
  
  function getDeobfuscateFunctionWithRegex(javaScriptPlayerCode, deobfuscationFunctionName) {
    const DEOBF_FUNC_REGEX_START = '(';
    const DEOBF_FUNC_REGEX_END = '=function\\([a-zA-Z0-9_]+\\)\\{.+?\\}';
    const functionPattern = DEOBF_FUNC_REGEX_START + RegExp.escape(deobfuscationFunctionName) + DEOBF_FUNC_REGEX_END;
    const regex = new RegExp(functionPattern);
    const match = javaScriptPlayerCode.match(regex);
    
    if (match && match[1]) {
      return `var ${match[1]}`;
    }
    return null;
  }
  
  function getHelperObject(javaScriptPlayerCode, helperObjectName) {
    const SIG_DEOBF_HELPER_OBJ_REGEX_START = '(var ';
    const SIG_DEOBF_HELPER_OBJ_REGEX_END = '=\\{(?:.|\\n)+?\\}\\};';
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
    
    const res = eval(code);
    return res;
  }

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getYoutubeStreamData };
}