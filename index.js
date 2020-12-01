const { default: Axios } = require('axios');
const puppeteer = require('puppeteer');
const express = require('express');
var bodyParser = require('body-parser');


const app = express()
const port = 3000

var jsonParser = bodyParser.json()

function getAuthToken(req) {
  let authToken = req.header('Authorization')

  if(authToken) {
    return authToken.split('Bearer')[1].trim()
  }

  return '';
}

async function isAuthorized(token) {
  let isAuthorized = false;

  try {
    const payload = await Axios.get(
      "https://api.buyerbridge.io/api/v1/users/current",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if(payload.data && !payload.error) {
      isAuthorized = true;
    }
  } catch(error) {}

  return isAuthorized;
}

function getRequestData(req) {
  try {
    const reqData = req.body;

    if(reqData.response && reqData.url && reqData.config) {
      return { isValid: true, body: reqData }
    }
  } catch(error) { }
  return { isValid: false, body: null }
}

function errorResponse(response) {
  response.status(400);
  response.json({
    error: {
      messages: [ 'Bad request body' ],
    }
  })
}

async function generatePdf(reqData, token) {

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(reqData.url, {waitUntil: 'networkidle2'});
    await page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
    }, token);
    await page.goto(reqData.url, {waitUntil: 'networkidle2'});
    await page.waitForSelector('.styled-slideout-panel', {visible: true});
    await page.waitForSelector('.v-datatable__actions', {visible: true});  

    const pdf = await page.pdf({
      format: 'A4',
      displayHeaderFooter: reqData.config ? reqData.config.displayHeaderFooter : false,
      footerTemplate: reqData.config ? reqData.config.footerTemplate : null,
      headerTemplate: reqData.config ? reqData.config.headerTemplate : null   
    });  
    await browser.close();

    return { taken: true, pdf };
  } catch(error) {
    console.log(error)
  }

  return { taken: false, pdf: null };

}

app.post('/generate', jsonParser, async (req, res) => {
  const token = getAuthToken(req);

  let headers = { 'Content-Type': 'application/json' };
  const isAuth = await isAuthorized(token);

  if(isAuth) {
    const { isValid, body } = getRequestData(req);

    if(!isValid) {        
      errorResponse(res);
      return;
    }

    console.log('Ready for Pupeteer headless')

    const { taken, pdf } = await generatePdf(body, token);

    if(!taken) {
      errorResponse(res);
      return;
    }

    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
    res.send(pdf)
  } else {
    res.send('Not Authorized')
  }
})

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})