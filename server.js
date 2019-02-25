'use strict';

// **************************************************
// Configuration and Setup
// **************************************************

// Application dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environmnet variables from .env file
require('dotenv').config();

// Application setup
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// Database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.log(err));


// **************************************************
// API Routes
// **************************************************

// Location route
app.get('/location', (request, response) => {
  getLocation(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

// Weather data route
app.get('/weather', getWeather);

// Meetups data route
app.get('/meetups', getMeetups);

// Yelp data route
app.get('/yelp', getYelps);

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
  this.formatted_query = res.formatted_address;
  this.latitude = res.geometry.location.lat;
  this.longitude = res.geometry.location.lng;
}

// // Constructor needed for getWeather()
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
  // console.error(error);
  if (response) response.status(500).send('Sorry, something went wrong');
}

// Geocode lookup handler

function getLocation(query) {
  // CREATE the query string to check for the existence of the location
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [query];

  // Make the query of the database
  return client.query(SQL, values)
    .then(result => {
      // Check to see if the location was found and return the results
      if (result.rowCount > 0) {
        // console.log('From SQL');
        return result.rows[0];

        // Otherwise get the location information from the Google API
      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

        return superagent.get(url)
          .then(data => {
            // console.log('FROM API line 90');
            // Throw an error if there is a problem with the API request
            if (!data.body.results.length) { throw 'no Data' }

            // Otherwise create an instance of Location
            else {
              let location = new Location(query, data.body.results[0]);
              // console.log('98', location);

              // Create a query string to INSERT a new record with the location data
              let newSQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id;`;
              // console.log('102', newSQL)
              let newValues = Object.values(location);
              // console.log('104', newValues)

              // Add the record to the database
              return client.query(newSQL, newValues)
                .then(result => {
                  // console.log('108', result.rows);
                  // Attach the id of the newly created record to the instance of location.
                  // This will be used to connect the location to the other databases.
                  // console.log('114', result.rows[0].id)
                  location.id = result.rows[0].id;
                  return location;
                })
                .catch(console.error);
            }
          })
          .catch(error => console.log('Error in SQL Call'));
      }
    });
}

// Weather route handler

function getWeather(request, response) {
  // CREATE the query string to check for the existence of the location
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  const values = [request.query.data.id];

  // Make the query of the database
  return client.query(SQL, values)
    .then(result => {
      // Check to see if the location was found and return the results
      if (result.rowCount > 0) {
        // console.log('from SQL');
        response.send(result.rows);
        // Otherwise get the location information from Dark Sky
      } else {
        const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

        superagent.get(url)
          .then(result => {
            const weatherSummaries = result.body.daily.data.map(day => {
              return new Weather(day)
            });
            let newSQL = `INSERT INTO weathers(forecast, time, location_id) VALUES ($1, $2, $3);`;
            // console.log('167', weatherSummaries) // array of objects
            weatherSummaries.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              // Add the record to the database
              return client.query(newSQL, newValues)
                .then(result => {
                  // console.log('174', result.rows);
                  // Attach the id of the newly created record to the instance of location.
                  // This will be used to connect the location to the other databases.
                  // console.log('177', result.rows[0].id)
                })
                .catch(error => handleError(error, response));
            })
            response.send(weatherSummaries);
          })
          .catch(error => handleError(error, response));
      }
    })
}

// Meetups route handler

function getMeetups(request, response) {
  console.log('ran getMeetups 191');
  // CREATE the query string to check for the existence of the location
  const SQL = `SELECT * FROM meetups WHERE location_id=$1;`;
  const values = [request.query.data.id];

  // Make the query of the database
  return client.query(SQL, values)
    .then(result => {
      // Check to see if the location was found and return the results
      if (result.rowCount > 0) {
        console.log('from SQL');
        response.send(result.rows);
        // Otherwise get the location information from Meetups
      } else {
        console.log('201 - get the location information from Meetups')
        const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&lat=${request.query.data.latitude}&key=${process.env.MEETUPS_API_KEY}`;
        console.log('206 meetups url:', url);

        superagent.get(url)
          .then(result => {
            const meetups = result.body.events.map(meetup => {
              return new Meetups(meetup)
            });
            let newSQL = `INSERT INTO meetups(link, name, creation_date, host, location_id) VALUES ($1, $2, $3, $4, $5);`;
            console.log('213 Meetups array:', meetups) // array of objects
            meetups.forEach(meetup => {
              let newValues = Object.values(meetup);
              newValues.push(request.query.data.id);
              // Add the record to the database
              return client.query(newSQL, newValues)
                .then(result => {
                  // console.log('220', result.rows);
                  // Attach the id of the newly created record to the instance of location.
                  // This will be used to connect the location to the other databases.
                  // console.log('223', result.rows[0].id)
                })
                .catch(error => handleError(error, response));
            })
            response.send(meetups);
          })
          .catch(error => handleError(error, response));
      }
    })
}

