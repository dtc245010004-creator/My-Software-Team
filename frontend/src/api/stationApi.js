import axios from 'axios';

// Địa chỉ API của server Backend
const API_URL = 'http://localhost:5000/api/stations';

export const fetchStationsApi = async () => {
  const response = await axios.get(API_URL);
  return response.data;
};

export const createStationApi = async (stationData) => {
  const response = await axios.post(API_URL, stationData);
  return response.data;
};