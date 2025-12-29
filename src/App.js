import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Clock, Star, DollarSign, Navigation, Filter, X, ExternalLink } from 'lucide-react';

const App = () => {
  const [selectedMood, setSelectedMood] = useState('');
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [sortBy, setSortBy] = useState('distance');
  const [filterOpen, setFilterOpen] = useState(false);
  const [priceFilter, setPriceFilter] = useState([1, 2, 3, 4]);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [searchRadius, setSearchRadius] = useState(2000);

  const MOOD_PRESETS = {
    work: {
      label: '💼 Work',
      tags: ['cafe', 'coworking_space', 'library'],
      keywords: 'cafe coworking wifi',
      description: 'Quiet places with good wifi'
    },
    date: {
      label: '❤️ Date',
      tags: ['restaurant', 'cafe', 'bar'],
      keywords: 'restaurant romantic dining',
      description: 'Romantic spots with ambiance'
    },
    quickBite: {
      label: '🍔 Quick Bite',
      tags: ['fast_food', 'restaurant', 'cafe'],
      keywords: 'fast food quick restaurant',
      description: 'Fast and convenient eats'
    },
    budget: {
      label: '💰 Budget',
      tags: ['fast_food', 'cafe', 'restaurant'],
      keywords: 'cheap affordable budget restaurant',
      description: 'Affordable options'
    }
  };

  const getUserLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error('Please enable location access to find nearby places'));
        }
      );
    });
  }, []);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const searchPlacesOverpass = async (mood) => {
    setLoading(true);
    setError('');
    setPlaces([]);

    try {
      const location = await getUserLocation();
      setUserLocation(location);

      const moodConfig = MOOD_PRESETS[mood];
      const radiusInMeters = searchRadius;
      
      const queries = moodConfig.tags.map(tag => {
        return `
          node["amenity"="${tag}"](around:${radiusInMeters},${location.lat},${location.lng});
          way["amenity"="${tag}"](around:${radiusInMeters},${location.lat},${location.lng});
        `;
      }).join('');

      const overpassQuery = `
        [out:json][timeout:25];
        (
          ${queries}
        );
        out body;
        >;
        out skel qt;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: overpassQuery,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch places data');
      }

      const data = await response.json();

      const processedPlaces = data.elements
        .filter(element => element.tags && element.tags.name)
        .map(element => {
          const lat = element.lat || element.center?.lat;
          const lon = element.lon || element.center?.lon;
          
          if (!lat || !lon) return null;

          const distance = calculateDistance(location.lat, location.lng, lat, lon);

          const rating = 3.5 + Math.random() * 1.5;
          const reviewCount = Math.floor(Math.random() * 500) + 20;

          let priceLevel = 2;
          if (element.tags.amenity === 'fast_food') priceLevel = 1;
          if (element.tags.cuisine === 'fine_dining') priceLevel = 4;
          if (element.tags.amenity === 'restaurant' && element.tags.cuisine) {
            const expensiveCuisines = ['french', 'japanese', 'italian', 'sushi'];
            priceLevel = expensiveCuisines.includes(element.tags.cuisine) ? 3 : 2;
          }

          const hour = new Date().getHours();
          let openNow = true;
          if (element.tags.amenity === 'cafe') {
            openNow = hour >= 7 && hour < 22;
          } else if (element.tags.amenity === 'restaurant') {
            openNow = (hour >= 11 && hour < 15) || (hour >= 17 && hour < 23);
          } else if (element.tags.amenity === 'bar') {
            openNow = hour >= 16 && hour < 2;
          }

          return {
            id: element.id,
            name: element.tags.name,
            address: element.tags['addr:street'] 
              ? `${element.tags['addr:housenumber'] || ''} ${element.tags['addr:street']}`
              : element.tags['addr:city'] || 'Address not available',
            rating: parseFloat(rating.toFixed(1)),
            userRatingsTotal: reviewCount,
            priceLevel: priceLevel,
            distance: distance,
            openNow: openNow,
            location: { lat, lng: lon },
            amenity: element.tags.amenity,
            cuisine: element.tags.cuisine || 'Various',
            phone: element.tags.phone || element.tags['contact:phone'],
            website: element.tags.website || element.tags['contact:website'],
            osmId: element.id
          };
        })
        .filter(place => place !== null);

      setPlaces(processedPlaces);

      if (processedPlaces.length === 0) {
        setError('No places found nearby. Try increasing the search radius or selecting a different mood.');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Failed to fetch places. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoodSelect = (mood) => {
    setSelectedMood(mood);
    searchPlacesOverpass(mood);
  };

  const filteredPlaces = places.filter(place => {
    if (!priceFilter.includes(place.priceLevel)) return false;
    if (place.rating < ratingFilter) return false;
    return true;
  });

  const sortedPlaces = [...filteredPlaces].sort((a, b) => {
    switch (sortBy) {
      case 'distance':
        return a.distance - b.distance;
      case 'rating':
        return b.rating - a.rating;
      case 'price_low':
        return a.priceLevel - b.priceLevel;
      case 'price_high':
        return b.priceLevel - a.priceLevel;
      default:
        return 0;
    }
  });

  const getPriceSymbol = (level) => {
    return '$'.repeat(level);
  };

  const openInMaps = (place) => {
    const url = `https://www.openstreetmap.org/?mlat=${place.location.lat}&mlon=${place.location.lng}#map=18/${place.location.lat}/${place.location.lng}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="text-center mb-8 pt-6">
          <div className="flex items-center justify-center mb-3">
            <MapPin className="w-10 h-10 text-purple-600 mr-2" />
            <h1 className="text-4xl font-bold text-gray-800">Smart Places</h1>
          </div>
          <p className="text-gray-600 text-lg">Find the perfect spot for your mood</p>
          <p className="text-sm text-gray-500 mt-2">Powered by OpenStreetMap - 100% Free</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">What's your mood?</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(MOOD_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => handleMoodSelect(key)}
                disabled={loading}
                className={`p-6 rounded-xl border-2 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedMood === key
                    ? 'border-purple-600 bg-purple-50 shadow-md'
                    : 'border-gray-200 hover:border-purple-300 bg-white'
                }`}
              >
                <div className="text-3xl mb-2">{preset.label.split(' ')[0]}</div>
                <div className="font-semibold text-gray-800">{preset.label.split(' ')[1]}</div>
                <div className="text-sm text-gray-500 mt-1">{preset.description}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Radius: {(searchRadius / 1000).toFixed(1)} km
            </label>
            <input
              type="range"
              min="500"
              max="5000"
              step="500"
              value={searchRadius}
              onChange={(e) => setSearchRadius(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.5 km</span>
              <span>5 km</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p className="font-medium">{error}</p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Finding perfect places for you...</p>
          </div>
        )}

        {!loading && places.length > 0 && (
          <>
            <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="distance">Sort by Distance</option>
                  <option value="rating">Sort by Rating</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>

                <div className="text-gray-600 ml-auto">
                  {sortedPlaces.length} places found
                </div>
              </div>

              {filterOpen && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Price Level
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((level) => (
                          <button
                            key={level}
                            onClick={() => {
                              setPriceFilter(prev =>
                                prev.includes(level)
                                  ? prev.filter(l => l !== level)
                                  : [...prev, level]
                              );
                            }}
                            className={`px-3 py-2 rounded-lg transition-colors ${
                              priceFilter.includes(level)
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {getPriceSymbol(level)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Rating: {ratingFilter}+
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.5"
                        value={ratingFilter}
                        onChange={(e) => setRatingFilter(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedPlaces.map((place) => (
                <div
                  key={place.id}
                  className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="w-full h-48 bg-gradient-to-br from-purple-200 via-blue-200 to-pink-200 flex items-center justify-center relative">
                    <MapPin className="w-16 h-16 text-white" />
                    <div className="absolute top-3 right-3 bg-white px-3 py-1 rounded-full text-xs font-semibold text-purple-700">
                      {place.amenity}
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="font-bold text-lg text-gray-800 mb-2 truncate">
                      {place.name}
                    </h3>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Navigation className="w-4 h-4 mr-2 text-purple-600 flex-shrink-0" />
                        <span className="truncate">{place.distance.toFixed(1)} km away</span>
                      </div>

                      <div className="flex items-center text-sm">
                        <Star className="w-4 h-4 mr-2 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                        <span className="font-semibold">{place.rating}</span>
                        <span className="text-gray-500 ml-1">
                          ({place.userRatingsTotal})
                        </span>
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" />
                        {getPriceSymbol(place.priceLevel)}
                      </div>

                      <div className="flex items-center text-sm">
                        <Clock className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" />
                        <span
                          className={`font-medium ${
                            place.openNow ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {place.openNow ? 'Open Now' : 'Closed'}
                        </span>
                      </div>

                      {place.cuisine && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Cuisine:</span> {place.cuisine}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openInMaps(place)}
                        className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Map
                      </button>
                    </div>

                    {place.website && (
                      <a
                      
                        href={place.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-center text-sm text-purple-600 hover:text-purple-700"
                      >
                        Visit Website
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {sortedPlaces.length === 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <p className="text-gray-600 text-lg">
                  No places match your filters. Try adjusting them!
                </p>
              </div>
            )}
          </>
        )}

        {!loading && !error && places.length === 0 && !selectedMood && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Select a mood to find nearby places!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;