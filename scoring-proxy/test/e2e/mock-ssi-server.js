// ============================================================
// Local Mock SSI Upstream Server for Playwright E2E UAT Tests
// Serves deterministic GraphQL + HTML responses at SSI_BASE_URL
// ============================================================

import http from 'node:http'

const tomorrowIso = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const dayAfterIso = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
const yesterdayIso = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

function createDefaultState() {
  return {
    competitorScores: {
      '901': { s1: '50 10 2 3 0 0 0 0 0 0 0 0 0', s2: '', s3: '', s4: '', s5: '', s6: '', tot_precision_points: 50, tot_hits: 5, tot_inner_hits: 2 },
      '902': { s1: '', s2: '', s3: '', s4: '', s5: '', s6: '', tot_precision_points: 0, tot_hits: 0, tot_inner_hits: 0 },
    },
    dnsSetIds: new Set(),
    squadOverrides: new Map(),
  }
}

export function startMockSsiServer(port = 4101) {
  let state = createDefaultState()

  const buildMatchNode = (id = '501', name = 'TurRes Kupittaa Osakilpailu 1', status = 'on') => ({
    id,
    name,
    starts: tomorrowIso(),
    rule: 'rl',
    status,
    get_content_type_key: 91,
    uses_strings: true,
    number_of_strings: 6,
    number_of_rounds_per_string: 5,
    competitors: [
      { id: '901', first_name: 'Matti', last_name: 'Meikäläinen', email: 'matti@example.com', number: 1, status: 'a' },
      { id: '902', first_name: 'Teppo', last_name: 'Testaaja', email: 'teppo@example.com', number: 2, status: 'a' },
      { id: '903', first_name: 'Outi', last_name: 'Odottaja', email: 'outi@example.com', number: 3, status: 'a' },
    ],
    squads: [
      {
        id: 'sq1',
        number: 1,
        comment: 'Laina-ase (pieni puoli)',
        max_competitors: 9,
        competitors: [
          {
            id: '901',
            first_name: 'Matti',
            last_name: 'Meikäläinen',
            email: 'matti@example.com',
            number: 1,
            status: 'a',
            did_not_finish: false,
            is_scoring_started: true,
            is_verified: false,
            weapon_group: 'STD',
            category: '-',
            classification: '-',
            ...state.competitorScores['901'],
            s1_points: 50, s2_points: 0, s3_points: 0, s4_points: 0, s5_points: 0, s6_points: 0,
            warning: false,
            dq_reason: 'no',
            score_comment: '',
          },
          {
            id: '902',
            first_name: 'Teppo',
            last_name: 'Testaaja',
            email: 'teppo@example.com',
            number: 2,
            status: 'a',
            did_not_finish: false,
            is_scoring_started: false,
            is_verified: false,
            weapon_group: 'STD',
            category: '-',
            classification: '-',
            ...state.competitorScores['902'],
            s1_points: 0, s2_points: 0, s3_points: 0, s4_points: 0, s5_points: 0, s6_points: 0,
            warning: false,
            dq_reason: 'no',
            score_comment: '',
          },
        ],
      },
      {
        id: 'sq2',
        number: 2,
        comment: 'Oma ase 1 (iso puoli, vasen)',
        max_competitors: 1,
        competitors: [
          {
            id: '904',
            first_name: 'Täysi',
            last_name: 'Ryhmä',
            email: 'taysi@example.com',
            number: 4,
            status: 'a',
          },
        ],
      },
      {
        id: 'sq3',
        number: 3,
        comment: 'Oma ase 2 (iso puoli, oikea)',
        max_competitors: 7,
        competitors: [],
      },
    ],
  })

  const buildCupNode = (id = '160', name = 'TurRes Kupittaa CUP 25.10.2026') => ({
    id,
    name,
    starts: tomorrowIso(),
    ends: dayAfterIso(),
    status: 'on',
    get_content_type_key: 136,
    max_competitors: 25,
    registration: 'op',
    registration_starts: yesterdayIso(),
    registration_closes: dayAfterIso(),
    competitors: [
      { id: '1371', status: 'a', email: 'matti@example.com', shooter: { first_name: 'Matti', last_name: 'Meikäläinen', email: 'matti@example.com' } },
      { id: '1372', status: 'a', email: 'teppo@example.com', shooter: { first_name: 'Teppo', last_name: 'Testaaja', email: 'teppo@example.com' } },
      { id: '1373', status: 'a', email: 'outi@example.com', shooter: { first_name: 'Outi', last_name: 'Odottaja', email: 'outi@example.com' } },
    ],
    component_matches: [
      { number: 1, included: true, match: buildMatchNode('501', 'TurRes Kupittaa Osakilpailu 1', 'on') },
      { number: 2, included: true, match: buildMatchNode('502', 'TurRes Kupittaa Osakilpailu 2 (Valmis)', 'cp') },
    ],
  })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const chunks = []
    for await (const c of req) chunks.push(c)
    const bodyText = Buffer.concat(chunks).toString('utf8')

    if (url.pathname === '/__reset' && req.method === 'POST') {
      state = createDefaultState()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true }))
    }

    if (url.pathname === '/graphql/' && req.method === 'POST') {
      const { query = '', variables = {} } = JSON.parse(bodyText || '{}')

      if (query.includes('token_auth')) {
        if (variables.password === 'wrong-password') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ errors: [{ message: 'Please enter valid credentials' }] }))
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: {
            token_auth: {
              token: { token: `mock-jwt-${variables.email || 'user'}` },
              refresh_token: { token: `mock-refresh-${variables.email || 'user'}` },
            },
          },
        }))
      }

      if (query.includes('refresh_token')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: {
            refresh_token: {
              token: { token: 'mock-refreshed-jwt' },
              refresh_token: { token: 'mock-refreshed-rt' },
            },
          },
        }))
      }

      if (query.includes('{ me')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: {
            me: { email: 'test@example.com', first_name: 'Testi', last_name: 'Toimitsija' },
          },
        }))
      }

      if (query.includes('events(')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: {
            events: [buildCupNode('160', 'TurRes Kupittaa CUP 25.10.2026')],
          },
        }))
      }

      if (query.includes('event(content_type: 136')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: { event: buildCupNode(String(variables.id || '160')) },
        }))
      }

      if (query.includes('event(content_type: 91')) {
        const matchId = String(variables.id || '501')
        const status = matchId === '502' ? 'cp' : 'on'
        const name = matchId === '502' ? 'TurRes Kupittaa Osakilpailu 2 (Valmis)' : 'TurRes Kupittaa Osakilpailu 1'
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: { event: buildMatchNode(matchId, name, status) },
        }))
      }

      if (query.includes('competitor(content_type: 93')) {
        const compId = String(variables.id || '901')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          data: {
            competitor: {
              id: compId,
              first_name: compId === '902' ? 'Teppo' : 'Matti',
              last_name: compId === '902' ? 'Testaaja' : 'Meikäläinen',
              number: compId === '902' ? 2 : 1,
              status: 'a',
              ...(state.competitorScores[compId] || state.competitorScores['901']),
            },
          },
        }))
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ data: {} }))
    }

    if (url.pathname.startsWith('/login/')) {
      if (req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': ['csrftoken=mockcsrf; Path=/'],
        })
        return res.end('<form method="post"><input type="hidden" name="csrfmiddlewaretoken" value="mockcsrf"/></form>')
      }
      const params = new URLSearchParams(bodyText)
      if (params.get('password') === 'wrong-password') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end('<ul class="errorlist"><li>Please enter a correct username and password.</li></ul>')
      }
      res.writeHead(302, {
        Location: '/dashboard/',
        'Set-Cookie': ['sessionid=mocksession; Path=/', 'csrftoken=mockcsrf; Path=/'],
      })
      return res.end()
    }

    if (url.pathname.match(/^\/nordic\/competitor\/\d+\/score-in-match\/$/)) {
      if (req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': ['csrftoken=mockcsrf; Path=/'],
        })
        return res.end(`<form action="${url.pathname}" method="post"><input type="hidden" name="csrfmiddlewaretoken" value="mockcsrf"/></form>`)
      }
      res.writeHead(302, { Location: url.pathname })
      return res.end()
    }

    if (url.pathname.match(/^\/event\/136\/\d+\/participants\/$/)) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(`
        <table>
          <tr>
            <td><a href="/event/participant/137/1371/">Matti Meikalainen</a></td>
            <td>matti.meikalainen@example.com</td>
            <td><a href="/event/participant/137/1371/toggle-status/"><abbr title="Approved">A</abbr></a></td>
            <td><a href="/event/participant/137/1371/toggle-paid/">all</a></td>
          </tr>
          <tr>
            <td><a href="/event/participant/137/1372/">Teppo Testaaja</a></td>
            <td>teppo@example.com</td>
            <td><a href="/event/participant/137/1372/toggle-status/"><abbr title="Approved">A</abbr></a></td>
            <td><a href="/event/participant/137/1372/toggle-paid/">no</a></td>
          </tr>
          <tr>
            <td><a href="/event/participant/137/1373/">Outi Odottaja</a></td>
            <td>outi@example.com</td>
            <td><a href="/event/participant/137/1373/toggle-status/"><abbr title="Approved">A</abbr></a></td>
            <td><a href="/event/participant/137/1373/toggle-paid/">no</a></td>
          </tr>
        </table>
      `)
    }

    if (url.pathname.match(/^\/event\/91\/\d+\/participants\/$/)) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(`
        <table>
          <tr><td><a href="/event/participant/93/901/">Matti Meikalainen</a> matti.meikalainen@example.com</td></tr>
          <tr><td><a href="/event/participant/93/902/">Teppo Testaaja</a> teppo@example.com</td></tr>
          <tr><td><a href="/event/participant/93/903/">Outi Odottaja</a> outi@example.com</td></tr>
        </table>
      `)
    }

    if (url.pathname.match(/^\/event\/\d+\/\d+\/participant-search-and-add\/$/)) {
      if (req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': ['csrftoken=mockcsrf; Path=/'],
        })
        return res.end('<form method="post"></form>')
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end('<a href="/event/136/160/participant-search-and-add/777/register/">Register</a>')
    }

    if (url.pathname.includes('/register/')) {
      res.writeHead(302, { Location: '/dashboard/' })
      return res.end()
    }

    if (url.pathname.match(/^\/event\/participant\/\d+\/\d+\/edit\/$/)) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end(`
          <form method="post" action="${url.pathname}">
            <select name="squad">
              <option value="101">Squad 1</option>
              <option value="102">Squad 2</option>
              <option value="103">Squad 3</option>
            </select>
            <select name="status"><option value="a" selected>Approved</option></select>
          </form>
        `)
      }
      res.writeHead(302, { Location: '/dashboard/' })
      return res.end()
    }

    if (
      url.pathname.includes('/toggle-status/') ||
      url.pathname.includes('/set-did-not-show/') ||
      url.pathname.includes('/undo-did-not-show/') ||
      url.pathname.includes('/toggle-paid/')
    ) {
      if (url.pathname.includes('/toggle-status/')) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end('<a href="/event/participant/137/1371/toggle-status/"><abbr title="Approved">A</abbr></a>')
      }
      res.writeHead(302, { Location: '/dashboard/' })
      return res.end()
    }

    if (url.pathname.match(/^\/groups\/\d+\/$/)) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(`
        <table>
          <tr>
            <td><input type="checkbox" value="501" /></td>
            <td>Edit</td>
            <td>Test Manager</td>
            <td>manager@example.com</td>
            <td>MD</td>
            <td>admin</td>
          </tr>
          <tr>
            <td><input type="checkbox" value="502" /></td>
            <td>Edit</td>
            <td>Admin User</td>
            <td>admin@example.com</td>
            <td>QM</td>
            <td>admin</td>
          </tr>
        </table>
      `)
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body>OK</body></html>')
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

if (process.argv[1] && process.argv[1].endsWith('mock-ssi-server.js')) {
  const port = Number(process.env.MOCK_SSI_PORT || 4101)
  startMockSsiServer(port).then(() => {
    console.log(`[mock-ssi] Listening on http://127.0.0.1:${port}`)
  })
}
