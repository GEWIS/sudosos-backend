
def sync_transfers(source, target):
    source.execute("select * from gebruiker order by gebruikersnaam asc")
    results = source.fetchall()
    print("DELETE FROM transfer where createdAt='2022-07-01 00:00:00.000000';")
    #print(f"Trying to sync {len(results)} balances")
    for i, result in enumerate(results):
#         if (i+1) % 100 == 0:
            #print(f"Finished syncing {i+1}/{len(results)} transfers")
        id = result[0]
        account_number = result[3][1:]
        #print(account_number);
        try:
            int(account_number)
        except Exception:
            continue
        if account_number == "OUDESANNEVANDERLINDEN" or (int(account_number) < 1000 and result[3].startswith("g")):
            continue
        balance = result[5]
        fine = result[6]
        balance = int((balance - fine)*100)
        if result[3].startswith("g"):
            if balance >= 0:
                print(f"insert into transfer(`version`, createdAt, updatedAt, fromId, toId, amount, description) SELECT 0, '2022-07-01 00:00:00.000000', '2022-07-01 00:00:00.000000', NULL, g.userId, {balance}, 'Initial transfer from SuSOS' FROM gewis_user AS g WHERE g.gewisId = {account_number};")
            else:
                balance *= -1
                print(f"insert into transfer(`version`, createdAt, updatedAt, fromId, toId, amount, description) SELECT 0, '2022-07-01 00:00:00.000000', '2022-07-01 00:00:00.000000', g.userId, NULL, {balance}, 'Initial transfer from SuSOS' FROM gewis_user AS g WHERE g.gewisId = {account_number};")
        elif result[3].startswith("e"):
            if balance >= 0:
                print(f"insert into transfer(`version`, createdAt, updatedAt, fromId, toId, amount, description) SELECT 0, '2022-07-01 00:00:00.000000', '2022-07-01 00:00:00.000000', NULL, u.id, {balance}, 'Initial transfer from SuSOS' FROM user AS u WHERE u.id = {id};")
            else:
                balance *= -1
                print(f"insert into transfer(`version`, createdAt, updatedAt, fromId, toId, amount, description) SELECT 0, '2022-07-01 00:00:00.000000', '2022-07-01 00:00:00.000000', u.id, NULL, {balance}, 'Initial transfer from SuSOS' FROM user AS u WHERE u.id = {id};")

    #print("Finished sync, committing to database")
