/*
 * https://github.com/ccagml/leetcode-extension/src/rpc/actionChain/leetcode.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Monday, November 14th 2022, 4:04:31 pm
 * Author: ccagml
 *
 * Copyright (c) 2022 ccagml . All rights reserved.
 */

let util = require("util");

let underscore = require("underscore");
let request = require("request");
let prompt_out = require("prompt");

var { context, CookieJar } = require('fetch-h2')
const ToughCookie = require('tough-cookie')
const myJar = new ToughCookie.CookieJar()
const cookieJar = new CookieJar(myJar);
const { fetch } = context({ cookieJar });
var parseCurl = require('parse-curl')

import { configUtils } from "../../utils/configUtils";
import { commUtils } from "../../utils/commUtils";
import { storageUtils } from "../../utils/storageUtils";
import { reply } from "../../utils/ReplyUtils";
import { sessionUtils } from "../../utils/sessionUtils";
import { ChainNodeBase } from "../chainNodeBase";
import { Queue } from "../../utils/queueUtils";

class LeetCode extends ChainNodeBase {
  id = 10;
  name = "leetcode";
  builtin = true;
  constructor() {
    super();
  }

  init() {
    configUtils.app = "leetcode";
  }

  getProblems = (_, cb) => {
    let that = this;
    let problems = [];
    const getCategory = function (category, _, cb) {
      that.getCategoryProblems(category, function (e, _problems) {
        if (e) {
          //
        } else {
          problems = problems.concat(_problems);
        }
        return cb(e);
      });
    };

    const q = new Queue(configUtils.sys.categories, {}, getCategory);
    q.run(null, function (e) {
      return cb(e, problems);
    });
  };

  /* Getting the problems from the category. */
  getCategoryProblems = (category, cb) => {
    const opts = makeOpts(configUtils.sys.urls.problems.replace("$category", category));

    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const json = JSON.parse(body);

        if (json.user_name.length === 0) {
          return cb(sessionUtils.errors.EXPIRED);
        }

        const problems = json.stat_status_pairs
          .filter((p) => !p.stat.question__hide)
          .map(function (p) {
            return {
              state: p.status || "None",
              id: p.stat.question_id,
              fid: p.stat.frontend_question_id,
              name: p.stat.question__title,
              slug: p.stat.question__title_slug,
              link: configUtils.sys.urls.problem.replace("$slug", p.stat.question__title_slug),
              locked: p.paid_only,
              percent: ((p.stat.total_acs * 100) / p.stat.total_submitted).toFixed(2),
              level: commUtils.getNameByLevel(p.difficulty.level),
              starred: p.is_favor,
              category: json.category_slug,
            };
          });

        return cb(null, problems);
      });
    } else {
      this.h2request.get(opts, function (e, resp, json) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);
        if (json.user_name.length === 0) {
          return cb(sessionUtils.errors.EXPIRED);
        }

        const problems = json.stat_status_pairs
          .filter((p) => !p.stat.question__hide)
          .map(function (p) {
            return {
              state: p.status || "None",
              id: p.stat.question_id,
              fid: p.stat.frontend_question_id,
              name: p.stat.question__title,
              slug: p.stat.question__title_slug,
              link: configUtils.sys.urls.problem.replace("$slug", p.stat.question__title_slug),
              locked: p.paid_only,
              percent: ((p.stat.total_acs * 100) / p.stat.total_submitted).toFixed(2),
              level: commUtils.getNameByLevel(p.difficulty.level),
              starred: p.is_favor,
              category: json.category_slug,
            };
          });

        return cb(null, problems);
      })
    }


  };

  /* A function that takes in a problem and a callback function. It then makes a request to the leetcode
server to get the problem's description, test cases, and other information. */
  getProblem = (problem, needTranslation, cb) => {
    const user = sessionUtils.getUser();
    if (problem.locked && !user.paid) return cb("failed to load locked problem!");

    const opts = makeOpts(configUtils.sys.urls.graphql);
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = problem.link;

    opts.json = true;
    opts.body = {
      query: [
        "query getQuestionDetail($titleSlug: String!) {",
        "  question(titleSlug: $titleSlug) {",
        "    content",
        "    stats",
        "    likes",
        "    dislikes",
        "    codeDefinition",
        "    sampleTestCase",
        "    enableRunCode",
        "    metaData",
        "    translatedContent",
        "  }",
        "}",
      ].join("\n"),
      variables: { titleSlug: problem.slug },
      operationName: "getQuestionDetail",
    };

    if (configUtils.isCN()) {
      request.post(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const q = body.data.question;
        if (!q) return cb("failed to load problem!");

        problem.totalAC = JSON.parse(q.stats).totalAccepted;
        problem.totalSubmit = JSON.parse(q.stats).totalSubmission;
        problem.likes = q.likes;
        problem.dislikes = q.dislikes;

        problem.desc = q.translatedContent && needTranslation ? q.translatedContent : q.content;

        problem.templates = JSON.parse(q.codeDefinition);
        problem.testcase = q.sampleTestCase;
        problem.testable = q.enableRunCode;
        problem.templateMeta = JSON.parse(q.metaData);
        // @si-yao: seems below property is never used.
        // problem.discuss =  q.discussCategoryId;

        return cb(null, problem);
      });
    } else {
      opts.json = opts.body
      delete opts.body
      this.h2request.post(opts, function (e, resp, body) {

        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const q = body.data.question;
        if (!q) return cb('failed to load problem!');

        problem.totalAC = JSON.parse(q.stats).totalAccepted;
        problem.totalSubmit = JSON.parse(q.stats).totalSubmission;
        problem.likes = q.likes;
        problem.dislikes = q.dislikes;

        problem.desc = (q.translatedContent && needTranslation) ? q.translatedContent : q.content;

        problem.templates = JSON.parse(q.codeDefinition);
        problem.testcase = q.sampleTestCase;
        problem.testable = q.enableRunCode;
        problem.templateMeta = JSON.parse(q.metaData);

        return cb(null, problem);
      });
    }


  };
  /* A function that is used to run the code on the server. */
  runCode = (opts, problem, cb) => {
    opts.method = "POST";
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = problem.link;
    opts.json = true;
    opts._delay = opts._delay || configUtils.network.delay || 1; // in seconds

    opts.body = opts.body || {};
    underscore.extendOwn(opts.body, {
      lang: problem.lang,
      question_id: parseInt(problem.id, 10),
      test_mode: false,
      typed_code: storageUtils.codeData(problem.file),
    });

    let that = this;

    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        if (body.error) {
          if (!body.error.includes("too soon")) return cb(body.error);

          ++opts._delay;

          const reRun = underscore.partial(that.runCode, opts, problem, cb);
          return setTimeout(reRun, opts._delay * 1000);
        }

        opts.json = false;
        opts.body = null;

        return cb(null, body);
      });
    } else {
      let new_opts: any = {}
      underscore.extendOwn(new_opts, opts);
      new_opts.json = opts.body
      delete new_opts.body

      that.h2request.post(new_opts, function (e, resp, body) {

        e = checkError(e, resp, 200);
        if (e) return cb(e);

        if (body.error) {
          if (!body.error.includes('too soon'))
            return cb(body.error);
          ++opts._delay;

          const reRun = underscore.partial(that.runCode, opts, problem, cb);
          return setTimeout(reRun, opts._delay * 1000);
        }

        opts.json = false;
        opts.body = null;

        return cb(null, body);
      });
    }

  };

  /* A function that is used to verify the result of a task. */
  verifyResult = (task, queue, cb) => {
    const opts = queue.ctx.opts;
    opts.method = "GET";
    opts.url = configUtils.sys.urls.verify.replace("$id", task.id);

    let that = this;
    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        let result = JSON.parse(body);
        if (result.state === "SUCCESS") {
          result = that.formatResult(result);
          underscore.extendOwn(result, task);
          queue.ctx.results.push(result);
        } else {
          queue.addTask(task);
        }
        return cb();
      });
    } else {
      this.h2request.get(opts, function (e, resp, result) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        if (result.state === 'SUCCESS') {
          result = that.formatResult(result);
          underscore.extendOwn(result, task);
          queue.ctx.results.push(result);
        } else {
          queue.addTask(task);
        }
        return cb();
      });
    }
  };

  /* Formatting the result of the submission. */
  formatResult = (result) => {
    const x: any = {
      ok: result.run_success,
      lang: result.lang,
      runtime: result.status_runtime || "",
      runtime_percentile: result.runtime_percentile || "",
      memory: result.status_memory || "",
      memory_percentile: result.memory_percentile || "",
      state: result.status_msg,
      testcase: util.inspect(result.input || result.last_testcase || ""),
      passed: result.total_correct || 0,
      total: result.total_testcases || 0,
      compare_result: result.compare_result || ""
    };

    x.error = underscore
      .chain(result)
      .pick((v, k) => /_error$/.test(k) && v.length > 0)
      .values()
      .value();

    if (/[runcode|interpret].*/.test(result.submission_id)) {
      // It's testing
      let output = result.code_output || [];
      if (Array.isArray(output)) {
        output = output.join("\n");
      }
      x.stdout = util.inspect(output);
      x.answer = result.code_answer;
      // LeetCode use 'expected_code_answer' to store the expected answer
      x.expected_answer = result.expected_code_answer;
    } else {
      // It's submitting
      x.answer = result.code_output;
      x.expected_answer = result.expected_output;
      x.stdout = result.std_output;
    }

    // make sure we pass eveything!
    if (x.passed !== x.total) x.ok = false;
    if (x.state !== "Accepted") x.ok = false;
    if (x.error.length > 0) x.ok = false;

    return x;
  };

  /* Testing the code. */
  testProblem = (problem, cb) => {
    const opts = makeOpts(configUtils.sys.urls.test.replace("$slug", problem.slug));
    opts.body = { data_input: problem.testcase };
    let that = this;
    this.runCode(opts, problem, function (e, task) {
      if (e) return cb(e);

      const tasks = [{ type: "Actual", id: task.interpret_id }];

      // Used by LeetCode-CN
      if (task.interpret_expected_id) {
        tasks.push({ type: "Expected", id: task.interpret_expected_id });
      }
      const q = new Queue(tasks, { opts: opts, results: [] }, that.verifyResult);
      q.run(null, function (e, ctx) {
        return cb(e, ctx.results);
      });
    });
  };

  /* Submitting a problem to the server. */
  submitProblem = (problem, cb) => {
    const opts = makeOpts(configUtils.sys.urls.submit.replace("$slug", problem.slug));
    opts.body = { judge_type: "large" };
    let that = this;
    this.runCode(opts, problem, function (e, task) {
      if (e) return cb(e);

      const tasks = [{ type: "Actual", id: task.submission_id }];
      const q = new Queue(tasks, { opts: opts, results: [] }, that.verifyResult);
      q.run(null, function (e, ctx) {
        return cb(e, ctx.results);
      });
    });
  };

  /* Getting the submissions for a problem. */
  getSubmissions = (problem, cb) => {
    const opts = makeOpts(configUtils.sys.urls.submissions.replace("$slug", problem.slug));
    opts.headers.Referer = configUtils.sys.urls.problem.replace("$slug", problem.slug);

    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        // FIXME: this only return the 1st 20 submissions, we should get next if necessary.
        const submissions = JSON.parse(body).submissions_dump;
        for (const submission of submissions)
          submission.id = underscore.last(underscore.compact(submission.url.split("/")));

        return cb(null, submissions);
      });
    } else {
      this.h2request.get(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        // FIXME: this only return the 1st 20 submissions, we should get next if necessary.
        const submissions = JSON.parse(body).submissions_dump;
        for (const submission of submissions)
          submission.id = underscore.last(underscore.compact(submission.url.split('/')));

        return cb(null, submissions);
      });
    }
  };

  /* Getting the submission code and the runtime distribution chart. */
  getSubmission = (submission, cb) => {
    const opts = makeOpts(configUtils.sys.urls.submission.replace("$id", submission.id));
    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        let re = body.match(/submissionCode:\s('[^']*')/);
        if (re) submission.code = eval(re[1]);

        re = body.match(/runtimeDistributionFormatted:\s('[^']+')/);
        if (re) submission.distributionChart = JSON.parse(eval(re[1]));
        return cb(null, submission);
      });
    } else {
      this.h2request.get(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        let re = body.match(/submissionCode:\s('[^']*')/);
        if (re) submission.code = eval(re[1]);

        re = body.match(/runtimeDistributionFormatted:\s('[^']+')/);
        if (re) submission.distributionChart = JSON.parse(eval(re[1]));
        return cb(null, submission);
      });
    }

  };

  /* A function that is used to star a problem. */
  starProblem = (problem, starred, cb) => {
    const user = sessionUtils.getUser();
    const operationName = starred ? "addQuestionToFavorite" : "removeQuestionFromFavorite";
    const opts = makeOpts(configUtils.sys.urls.graphql);
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = problem.link;

    opts.json = true;
    opts.body = {
      query: `mutation ${operationName}($favoriteIdHash: String!, $questionId: String!) {\n  ${operationName}(favoriteIdHash: $favoriteIdHash, questionId: $questionId) {\n    ok\n    error\n    favoriteIdHash\n    questionId\n    __typename\n  }\n}\n`,
      variables: { favoriteIdHash: user.hash, questionId: "" + problem.id },
      operationName: operationName,
    };

    if (configUtils.isCN()) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request.post(opts, function (e: any, resp: any, _) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);
        return cb(null, starred);
      });
    } else {

      opts.json = opts.body
      delete opts.body
      this.h2request.post(opts, function (e, resp, _) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);
        return cb(null, starred);
      });

    }
  };

  h2request = {
    h2core(opts, cb) {
      cookieJar.setCookies(
        opts?.headers?.cookie?.split?.(';') || [],
        configUtils.sys.urls.base
      ).then(() => {
        if (opts?.headers?.cookie) delete opts.headers.cookie
        if (opts?.headers?.Cookie) delete opts.headers.Cookie
        opts.allowForbiddenHeaders = true
        opts.timeout = 10000
        return fetch(opts.url, opts).then(function (response) {
          if (!response.ok) {
            const c = `HTTP ${opts.method} error with opts: ${JSON.stringify(opts)} Response: ${JSON.stringify(response)}`
            return cb(new Error(c))
          }
          // Save new "Set-Cookie" cookies to cache
          const user = sessionUtils.getUser()
          user.my_us_header.cookie = myJar.getCookieStringSync(opts.url)
          sessionUtils.saveUser(user);

          if (!response.json) {
            const c = `HTTP ${opts.method} didn't respond with JSON opts: ${JSON.stringify(opts)} Response: ${JSON.stringify(response)}`
            cb(new Error(c))
          } else {
            response.json().then((data) => {
              cb(null, response, data)
            })
          }
        })
      })
    },
    post(opts, cb) {
      opts.method = 'POST'
      this.h2core(opts, cb)
    },
    get(opts, cb) {
      opts.method = 'GET'
      this.h2core(opts, cb)
    }
  }


  /* Making a request to the server to get the favorites. */
  getFavorites = (cb: any) => {

    const opts = makeOpts(configUtils.sys.urls.favorites);
    if (!configUtils.isCN()) {
      this.h2request.get(opts, function (e, resp, favorites) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);
        return cb(null, favorites);
      });
    } else {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const favorites = JSON.parse(body);
        return cb(null, favorites);
      });
    }


  };

  /* Making a POST request to the GraphQL API. */
  getUserInfo = (cb: any) => {
    const opts = makeOpts(configUtils.sys.urls.graphql);
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = configUtils.sys.urls.base;
    opts.json = true;
    opts.body = {
      query: ["{", "  user {", "    username", "    isCurrentUserPremium", "  }", "}"].join("\n"),
      variables: {},
    };

    if (configUtils.isCN()) {

      request.post(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const user = body.data.user;
        return cb(null, user);
      });
    } else {
      opts.json = opts.body
      delete opts.body
      this.h2request.post(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e) return cb(e);

        const user = body.data.user;
        return cb(null, user);
      });
    }

  };

  /* Making a request to the server and returning the response. */
  runSession = (method: any, data: any, cb: any) => {
    const opts = makeOpts(configUtils.sys.urls.session);
    opts.json = true;
    opts.method = method;
    opts.body = data;

    if (configUtils.isCN()) {
      request(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e && e.statusCode === 302) e = sessionUtils.errors.EXPIRED;

        return e ? cb(e) : cb(null, body.sessions);
      });
    } else {
      this.h2request.get(opts, function (e, resp, body) {
        e = checkError(e, resp, 200);
        if (e && e.status === 302) e = sessionUtils.errors.EXPIRED;

        return e ? cb(e) : cb(null, body.sessions);
      });
    }


  };

  getSessions = (cb) => {
    this.runSession("POST", {}, cb);
  };

  activateSession = (session, cb) => {
    const data = { func: "activate", target: session.id };
    this.runSession("PUT", data, cb);
  };

  createSession = (name, cb) => {
    const data = { func: "create", name: name };
    this.runSession("PUT", data, cb);
  };

  deleteSession = (session, cb) => {
    const data = { target: session.id };
    this.runSession("DELETE", data, cb);
  };

  /* A function that takes in a user object and a callback function. It then makes a request to the login
page and gets the csrf token. It then makes a post request to the login page with the csrf token and
the user's login and password. If the response status code is 302, it saves the user's session id
and csrf token to the user object and saves the user object to the session. */
  signin = (user: any, cb: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request(configUtils.sys.urls.login, function (e: any, resp: any, _) {
      e = checkError(e, resp, 200);
      if (e) return cb(e);
      user.loginCSRF = commUtils.getSetCookieValue(resp, "csrftoken");
      const opts = {
        url: configUtils.sys.urls.login,
        headers: {
          Origin: configUtils.sys.urls.base,
          Referer: configUtils.sys.urls.login,
          Cookie: "csrftoken=" + user.loginCSRF + ";",
        },
        form: {
          csrfmiddlewaretoken: user.loginCSRF,
          login: user.login,
          password: user.pass,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request.post(opts, function (e: any, resp: any, _) {
        if (e) return cb(e);
        if (resp.statusCode !== 302) {
          let _temp_msg = JSON.stringify({
            statusCode: resp.statusCode,
            body: resp.body,
            statusMessage: resp.statusMessage,
            msg: "密码错误?",
            msg1: "invalid password?",
            msg2: "要是用浏览器在力扣官网登录过账号还没过期, 插件的登录会被拒绝,使得登录失败,尝试用cookie方式登录",
          });
          return cb(_temp_msg);
        }

        user.sessionCSRF = commUtils.getSetCookieValue(resp, "csrftoken");
        user.sessionId = commUtils.getSetCookieValue(resp, "LEETCODE_SESSION");
        sessionUtils.saveUser(user);
        return cb(null, user);
      });
    });
  };

  /* Retrieving the user's favorites and user info. */
  getUser = (user, cb) => {
    let that = this;
    this.getFavorites(function (e, favorites) {
      if (!e) {
        const f = favorites.favorites.private_favorites.find((f) => f.name === "Favorite");
        if (f) {
          user.hash = f.id_hash;
          user.name = favorites.user_name;
        } else {
          // reply.warn("Favorite not found?");
        }
      } else {
        // return cb(e);
        // reply.warn("Failed to retrieve user favorites: " + e);
      }

      that.getUserInfo(function (e, _user) {
        if (!e) {
          user.paid = _user.isCurrentUserPremium;
          user.name = _user.username;
        }
        sessionUtils.saveUser(user);
        return cb(null, user);
      });
    });
  };

  login = (user, cb) => {
    let that = this;
    that.signin(user, function (e, user) {
      if (e) return cb(e);
      that.getUser(user, cb);
    });
  };

  /* Parsing the cookie to get the sessionId and sessionCSRF. */
  parseCookie = (cookie, cb) => {
    const SessionPattern = /LEETCODE_SESSION=(.+?)(;|$)/;
    const csrfPattern = /csrftoken=(.+?)(;|$)/;
    const reCsrfResult = csrfPattern.exec(cookie);
    const reSessionResult = SessionPattern.exec(cookie);
    if (reSessionResult === null || reCsrfResult === null) {
      return cb("invalid cookie?");
    }
    return {
      sessionId: reSessionResult[1],
      sessionCSRF: reCsrfResult[1],
    };
  };
  /* A function that is used to login to leetcode. */

  requestLeetcodeAndSave = (request, leetcodeUrl, user, cb) => {
    let that = this;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request.get({ url: leetcodeUrl }, function (_, resp, __) {
      const redirectUri = resp.request.uri.href;
      if (redirectUri !== configUtils.sys.urls.leetcode_redirect) {
        return cb("Login failed. Please make sure the credential is correct.");
      }
      const cookieData = that.parseCookie(resp.request.headers.cookie, cb);
      user.sessionId = cookieData.sessionId;
      user.sessionCSRF = cookieData.sessionCSRF;
      sessionUtils.saveUser(user);
      that.getUser(user, cb);
    });
  };

  cookieLogin = (user, cb) => {

    if (configUtils.isCN()) {
      const cookieData = this.parseCookie(user.cookie, cb);
      user.sessionId = cookieData.sessionId;
      user.sessionCSRF = cookieData.sessionCSRF;
      sessionUtils.saveUser(user);
      this.getUser(user, cb);
    } else {
      const curl = parseCurl(user.cookie)
      if (curl.header.referer) delete curl.header.referer
      if (curl.header.Referer) delete curl.header.Referer
      user.my_us_header = curl.header
      sessionUtils.saveUser(user);
      this.getUser(user, cb);
    }
  };

  curlcookieLogin = (user, cb) => {

    if (configUtils.isCN()) {
      const cookieData = this.parseCookie(user.cookie, cb);
      user.sessionId = cookieData.sessionId;
      user.sessionCSRF = cookieData.sessionCSRF;
      sessionUtils.saveUser(user);
      this.getUser(user, cb);
    } else {
      const curl = parseCurl(user.curl_data)
      if (curl.header.referer) delete curl.header.referer
      if (curl.header.Referer) delete curl.header.Referer
      user.my_us_header = curl.header
      sessionUtils.saveUser(user);
      this.getUser(user, cb);
    }
  };

  /* A function that is used to login to GitHub. */
  githubLogin = (user, cb) => {
    const urls = configUtils.sys.urls;
    const leetcodeUrl = urls.github_login;
    const _request = request.defaults({ jar: true });
    let that = this;
    _request(urls.github_login_request, function (_, __, body) {
      const authenticityToken = body.match(/name="authenticity_token" value="(.*?)"/);
      let gaId = body.match(/name="ga_id" value="(.*?)"/);
      if (!gaId) {
        gaId = "";
      }
      let requiredField = body.match(/name="required_field_(.*?)"/);
      const timestamp = body.match(/name="timestamp" value="(.*?)"/);
      const timestampSecret = body.match(/name="timestamp_secret" value="(.*?)"/);

      if (!(authenticityToken && timestamp && timestampSecret && requiredField)) {
        return cb("Get GitHub payload failed");
      }
      requiredField = "required_field_" + requiredField[1];
      const options = {
        url: urls.github_session_request,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        followAllRedirects: true,
        form: {
          login: user.login,
          password: user.pass,
          authenticity_token: authenticityToken[1],
          commit: encodeURIComponent("Sign in"),
          ga_id: gaId,
          "webauthn-support": "supported",
          "webauthn-iuvpaa-support": "unsupported",
          return_to: "",
          requiredField: "",
          timestamp: timestamp[1],
          timestamp_secret: timestampSecret[1],
        },
      };
      _request(options, function (_, resp, body) {
        if (resp.statusCode !== 200) {
          return cb("GitHub login failed");
        }
        if (!resp.request.uri.href.startsWith(urls.github_tf_redirect)) {
          return that.requestLeetcodeAndSave(_request, leetcodeUrl, user, cb);
        }
        prompt_out.colors = false;
        prompt_out.message = "";
        prompt_out.start();
        prompt_out.get(
          [
            {
              name: "twoFactorCode",
              required: true,
            },
          ],
          function (e, result) {
            if (e) return reply.info(e);
            const authenticityTokenTwoFactor = body.match(/name="authenticity_token" value="(.*?)"/);
            if (authenticityTokenTwoFactor === null) {
              return cb("Get GitHub two-factor token failed");
            }
            const optionsTwoFactor = {
              url: urls.github_tf_session_request,
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              followAllRedirects: true,
              form: {
                otp: result.twoFactorCode,
                authenticity_token: authenticityTokenTwoFactor[1],
                utf8: encodeURIComponent("✓"),
              },
            };
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _request(optionsTwoFactor, function (_, resp, __) {
              if (resp.request.uri.href === urls.github_tf_session_request) {
                return cb("Invalid two-factor code please check");
              }
              that.requestLeetcodeAndSave(_request, leetcodeUrl, user, cb);
            });
          }
        );
      });
    });
  };

  /* A function that logs into LinkedIn and then logs into LeetCode. */
  linkedinLogin = (user, cb) => {
    const urls = configUtils.sys.urls;
    const leetcodeUrl = urls.linkedin_login;
    const _request = request.defaults({
      jar: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36",
      },
    });
    let that = this;
    _request(urls.linkedin_login_request, function (_, resp, body) {
      if (resp.statusCode !== 200) {
        return cb("Get LinkedIn session failed");
      }
      const csrfToken = body.match(/input type="hidden" name="csrfToken" value="(.*?)"/);
      const loginCsrfToken = body.match(/input type="hidden" name="loginCsrfParam" value="(.*?)"/);
      const sIdString = body.match(/input type="hidden" name="sIdString" value="(.*?)"/);
      const pageInstance = body.match(/input type="hidden" name="pageInstance" value="(.*?)"/);
      if (!(csrfToken && loginCsrfToken && sIdString && pageInstance)) {
        return cb("Get LinkedIn payload failed");
      }
      const options = {
        url: urls.linkedin_session_request,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        followAllRedirects: true,
        form: {
          csrfToken: csrfToken[1],
          session_key: user.login,
          ac: 2,
          sIdString: sIdString[1],
          parentPageKey: "d_checkpoint_lg_consumerLogin",
          pageInstance: pageInstance[1],
          trk: "public_profile_nav-header-signin",
          authUUID: "",
          session_redirect: "https://www.linkedin.com/feed/",
          loginCsrfParam: loginCsrfToken[1],
          fp_data: "default",
          _d: "d",
          showGoogleOneTapLogin: true,
          controlId: "d_checkpoint_lg_consumerLogin-login_submit_button",
          session_password: user.pass,
          loginFlow: "REMEMBER_ME_OPTIN",
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _request(options, function (_, resp, __) {
        if (resp.statusCode !== 200) {
          return cb("LinkedIn login failed");
        }
        that.requestLeetcodeAndSave(_request, leetcodeUrl, user, cb);
      });
    });
  };

  /* A function that is used to get the rating of the problems. */
  getRatingOnline = (cb) => {
    const _request = request.defaults({ timeout: 2000, jar: true });
    _request("https://zerotrac.github.io/leetcode_problem_rating/data.json", function (error: any, _, body: any) {
      // console.log(error);
      // console.log(info);
      cb(error, body);
    });
  };

  /* A function that gets the question of the day from leetcode. */
  getQuestionOfToday = (cb) => {
    const opts = makeOpts(configUtils.sys.urls.graphql);
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = "https://leetcode.com/";

    opts.json = true;
    opts.body = {
      operationName: "questionOfToday",
      variables: {},
      query: [
        "query questionOfToday {",
        "  todayRecord {",
        "    date",
        "    userStatus",
        "    question {",
        "      titleSlug",
        "      questionId",
        "      questionFrontendId",
        // '      content',
        // '      stats',
        // '      likes',
        // '      dislikes',
        // '      codeDefinition',
        // '      sampleTestCase',
        // '      enableRunCode',
        // '      metaData',
        // '      translatedContent',
        "      __typename",
        "    }",
        "  __typename",
        "  }",
        "}",
      ].join("\n"),
    };

    // request.post(opts, function (e, resp, body) {
    //   e = checkError(e, resp, 200);
    //   if (e) return cb(e);
    //   let result: any = {};
    //   result.titleSlug = body.data.todayRecord[0].question.titleSlug;
    //   result.questionId = body.data.todayRecord[0].question.questionId;
    //   result.fid = body.data.todayRecord[0].question.questionFrontendId;
    //   result.date = body.data.todayRecord[0].data;
    //   result.userStatus = body.data.todayRecord[0].userStatus;
    //   return cb(null, result);
    // });
    cb(null, {});
  };


  /* A function that gets the recent contests from leetcode. */
  getRecentContestList = (cb) => {
    const opts: any = {};
    opts.url = "https://leetcode.cn/graphql";
    opts.headers = {};
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = "https://leetcode.cn/contest/";

    opts.json = true;
    /*
      {"operationName":"contestHistory","variables":{"pageNum":1,"pageSize":10},"query":"query contestHistory($pageNum: Int!, $pageSize: Int) {\n  contestHistory(pageNum: $pageNum, pageSize: $pageSize) {\n    totalNum\n    contests {\n      containsPremium\n      title\n      cardImg\n      titleSlug\n      description\n      startTime\n      duration\n      originStartTime\n      isVirtual\n      company {\n        watermark\n        __typename\n      }\n      isEeExamContest\n      __typename\n    }\n    __typename\n  }\n}\n"}
    */
    opts.body = {
      operationName: "contestHistory",
      variables: {"pageNum":1,"pageSize":10},
      query: [
        "query contestHistory($pageNum: Int!, $pageSize: Int) {",
        "  contestHistory(pageNum: $pageNum, pageSize: $pageSize) {",
        "    totalNum",
        "    contests {",
        "      containsPremium",
        "      title",
        // "      cardImg",
        "      titleSlug",
        // "      description",
        "      startTime",
        "      duration",
        "      originStartTime",
        "      isVirtual",
        "      company {",
        "        watermark",
        "        __typename",
        "      }",
        "      isEeExamContest",
        "      __typename",
        "    }",
        "    __typename",
        "  }",
        "}",
      ].join("\n"),
    };

    request.post(opts, function (e, resp, body) {
      e = checkError(e, resp, 200);
      if (e) return cb(e);
      let result: any = {};
      result.contests = body.data.contestHistory.contests;
      result.contests.forEach((contest: any) => {
        contest.title = contest.titleSlug.replace(/-/g, ' ');
      });
      return cb(null, result);
    });
  };

  /* A function that gets the questions from contests. */
  getContestQuestionList = (contestName,cb) => {
    let problems = [];
    let contestList = contestName.split(",");
    let that = this;
    const getQuestion = function (contestName, _, cb) {
      that.getQuestionFromOneContest(contestName, function (e, _problems) {
        if (e) {
          //
        } else {
          problems = problems.concat(_problems);
        }
        return cb(e);
      });
    };
    const q = new Queue(contestList, {}, getQuestion);
    q.run(null, function (e) {
      return cb(e, problems);
    });

  };

  getQuestionFromOneContest = (contestName,cb) => {
    request.get("https://leetcode.cn/contest/api/info/" + contestName + "/",{ json: true }, function (e, resp, body) {
      e = checkError(e, resp, 200);
      if (e) return cb(e);
      let result: any = {};
      result.questions = body.questions;
      result.contest = contestName;
      return cb(null, result);
    });
  };

  /* A function that is used to get the user contest ranking information. */
  getUserContestP = (username, cb) => {
    const opts = makeOpts(configUtils.sys.urls.noj_go);
    opts.headers.Origin = configUtils.sys.urls.base;
    opts.headers.Referer = configUtils.sys.urls.u.replace("$username", username);

    opts.json = true;
    opts.body = {
      variables: {
        userSlug: username,
      },
      query: [
        "        query userContestRankingInfo($userSlug: String!) {",
        "          userContestRanking(userSlug: $userSlug) {",
        "            attendedContestsCount",
        "            rating",
        "            globalRanking",
        "            localRanking",
        "            globalTotalParticipants",
        "            localTotalParticipants",
        "            topPercentage",
        "        }",
        // '      userContestRankingHistory(userSlug: $userSlug) {',
        // '            attended',
        // '            totalProblems',
        // '            trendingDirection',
        // '            finishTimeInSeconds',
        // '            rating',
        // '            score',
        // '            ranking',
        // '            contest {',
        // '              title',
        // '              titleCn',
        // '              startTime',
        // '            }',
        // '        }',
        "    }",
      ].join("\n"),
    };

    // request.post(opts, function (e, resp, body) {
    //   e = checkError(e, resp, 200);
    //   if (e) return cb(e);

    //   return cb(null, body.data);
    // });
    cb(null, {});
  };

  getHelpOnline = (problem, _, lang) => {
    getHelpEn(problem, lang, function (e, solution) {
      if (e) return;
      if (!solution) return reply.info(JSON.stringify({ code: -1, msg: `Solution not found for ${lang}` }));
      let URL_DISCUSS = "https://leetcode.com/problems/$slug/discuss/$id";
      let link = URL_DISCUSS.replace("$slug", problem.slug).replace("$id", solution.id);
      let content = solution.post.content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

      let solution_result: any = {};
      solution_result.problem_name = problem.name;
      solution_result.title = solution.title;
      solution_result.url = link;
      solution_result.lang = lang;
      solution_result.author = solution.post.author.username;
      solution_result.votes = solution.post.voteCount;
      solution_result.body = content;
      solution_result.is_cn = false;
      reply.info(JSON.stringify({ code: 100, solution: solution_result }));
    });
  };
}

/**
 * It takes a problem object, a language, and a callback. It then makes a request to the LeetCode
 * Discuss API to get the top voted solution for that problem in that language
 * @param problem - the problem object
 * @param lang - The language of the solution.
 * @param cb - callback function
 * @returns A solution to the problem.
 */
function getHelpEn(problem, lang, cb) {
  if (!problem) return cb();
  let URL_DISCUSSES = "https://leetcode.com/graphql";

  if (lang === "python3") lang = "python";
  const opts11 = makeOpts(URL_DISCUSSES);
  let opts = {
    headers: opts11,
    url: URL_DISCUSSES,
    json: true,
    body: {
      query: [
        "query questionTopicsList($questionId: String!, $orderBy: TopicSortingOption, $skip: Int, $query: String, $first: Int!, $tags: [String!]) {",
        "  questionTopicsList(questionId: $questionId, orderBy: $orderBy, skip: $skip, query: $query, first: $first, tags: $tags) {",
        "    ...TopicsList",
        "  }",
        "}",
        "fragment TopicsList on TopicConnection {",
        "  totalNum",
        "  edges {",
        "    node {",
        "      id",
        "      title",
        "      post {",
        "        content",
        "        voteCount",
        "        author {",
        "          username",
        "        }",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n"),

      operationName: "questionTopicsList",
      variables: JSON.stringify({
        query: "",
        first: 1,
        skip: 0,
        orderBy: "most_votes",
        questionId: "" + problem.id,
        tags: [lang],
      }),
    },
  };
  request(opts, function (e, resp, body) {
    if (e) return cb(e);
    if (resp.statusCode !== 200) return cb({ msg: "http error", statusCode: resp.statusCode });

    const solutions = body.data.questionTopicsList.edges;
    const solution = solutions.length > 0 ? solutions[0].node : null;
    return cb(null, solution);
  });
}
function makeOpts(url) {
  const opts: any = {};
  opts.url = url;
  opts.headers = {};

  signOpts(opts, sessionUtils.getUser());
  return opts;
}

function signOpts(opts, user) {

  if (user.my_us_header) {
    opts.headers = user.my_us_header
    return
  }

  opts.headers.Cookie = "LEETCODE_SESSION=" + user.sessionId + ";csrftoken=" + user.sessionCSRF + ";";
  opts.headers["X-CSRFToken"] = user.sessionCSRF;
  opts.headers["X-Requested-With"] = "XMLHttpRequest";
  opts.headers["x-csrftoken"] = user.sessionCSRF;
  opts.headers['User-Agent'] = configUtils.sys.my_headers.User_Agent
  opts.headers['Referer'] = configUtils.sys.my_headers.Referer
  opts.headers['Origin'] = configUtils.sys.my_headers.Origin
  opts.headers['Host'] = configUtils.sys.my_headers.Host
  opts.headers['Content-Type'] = configUtils.sys.my_headers.Content_Type
  opts.headers['Accept'] = configUtils.sys.my_headers.Accept
  opts.my_us_cookie = user.my_us_cookie
}
function checkError(e, resp, expectedStatus) {
  if (!e && resp && (resp.statusCode || resp.status) !== expectedStatus) {
    const code = (resp.statusCode || resp.status);

    if (code === 403 || code === 401) {
      e = sessionUtils.errors.EXPIRED;
    } else {
      e = { msg: "http error", statusCode: code };
    }
  }
  return e;
}

export const pluginObj: LeetCode = new LeetCode();
