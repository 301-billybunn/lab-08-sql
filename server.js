'use strict';

// **************************************************
// Configuration and Setup
// **************************************************

// Application dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');

// Load environmnet variables from .env file
require('dotenv').config();

// Application setup
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// **************************************************
// API Routes
// **************************************************

// Location route
app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

// Weather data route
app.get('/weather', getWeather);

// Meetups data route
app.get('/meetups', getMeetups);

// Catch-all route
app.use('*', handleError);

// Make sure server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// **************************************************
// Models
// **************************************************

// Constructor needed for searchToLatLong()
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

// Constructor needed for getWeather()
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

// Constructor needed for getMeetups()
function Meetups(response) {
  this.link = response.link;
  this.name = response.name;
  this.creation_date = new Date(response.created).toString().slice(0, 15)
  this.host = response.group.name;
}

// **************************************************
// Helper functions
// **************************************************

// Error handler

function handleError(error, response) {
  console.error(error);
  if (response) response.status(500).send('Sorry, something went wrong');
}

// Geocode lookup handler

function searchToLatLong(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(res => {
      return new Location(query, res);
    })
    .catch(error => handleError(error));
}

// Weather route handler

function getWeather(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day)
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

// Meetups route handler

function getMeetups(request, response) {
  const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&lat=${request.query.data.latitude}&key=${process.env.MEETUPS_API_KEY}`;

  superagent.get(url)
    .then(result => {
      const meetups = result.body.events.map(meetup => {
        return new Meetups(meetup)
      });
      response.send(meetups);
    })
    .catch(error => handleError(error, response));
}
