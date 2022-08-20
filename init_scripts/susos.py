import sqlite3

import mysql.connector
from transfers import sync_transfers
import os
from users import sync_users
from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.
susos_passwd = os.getenv('SUSOS_PASSWORD')
sudosos_passwd = os.getenv('TYPEORM_PASSWORD')
susos_db = mysql.connector.connect(
  host="legacy.mysql.gewis.nl",
  port="3306",
  user="sudosos",
  passwd=susos_passwd.encode("utf-8"),
  database="susos"
)
susos_cursor = susos_db.cursor()
sudosos_cursor = None
sync_transfers(susos_cursor, sudosos_cursor)
susos_cursor.close()
