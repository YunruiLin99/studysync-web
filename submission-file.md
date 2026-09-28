# Submission Guide

## Link to GitHub Repository

Flutter Application Name - StudySync GitHub Repository - https://github.com/YunruiLin99/casa0015-mobile-assessment

## Introduction to Application

StudySync is a cross-platform Flutter mobile application designed to help university students evaluate whether their current environment is suitable for studying. The app combines two key data sources: real-time ambient light detection using the device camera, and live weather data fetched from the OpenWeatherMap REST API.

The camera plugin captures image frames and applies a brightness algorithm to estimate the environmental Lux value, classifying it as Bright, Moderate, or Dim. Combined with live temperature and weather conditions, the app generates colour-coded study advice — green for ideal conditions, orange for acceptable, and red for poor environments. Users can save their current environment status as a timestamped record, which is stored locally using SharedPreferences and visualised as a light trend chart on the History screen.

The app contains three main screens: Home, History, and About, and was built entirely in Dart using the Flutter SDK, ensuring deployment across both iOS and Android devices.

## Bibliography

1. Flutter Team. (2024). Flutter Documentation. Google LLC. https://flutter.dev/docs
2. OpenWeatherMap. (2024). Current Weather Data API. OpenWeatherMap. https://openweathermap.org/api

## Declaration of Authorship

We, Yunrui Lin, confirm that the work presented in this assessment is my own. Where information has been derived from other sources, I confirm that this has been indicated in the work.

Digitally Sign with: Yunrui Lin

ASSESSMENT DATE: 30 April 2026
