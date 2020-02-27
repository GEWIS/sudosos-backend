import express from 'express';
import Swagger from './swagger';

const app = express();
Swagger.initialize(app);

app.listen(3000);
