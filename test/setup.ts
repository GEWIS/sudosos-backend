import { use } from 'chai';
import chaiSwag from 'chai-swag';
import chaiHttp from 'chai-http';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);
use(chaiHttp);
use(chaiSwag);
