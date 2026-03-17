# FindMore API Complete Documentation

**Base URL:** `http://localhost:3000` (Local)  
**Authentication Type:** JWT (JSON Web Token) Bearer Token  
**Content-Type:** `application/json` (except for file uploads which use `multipart/form-data`)

---

## 🔒 1. Authentication & Admin APIs

These APIs manage the admins for the hotels and issue access tokens required for specific actions.

### 1.1 Register Admin

Registers a new manager assigned to a specific hotel.

- **Endpoint:** `POST /api/auth/register`
- **Request Body:**

```json
{
  "hotel_id": "hotel1",
  "name": "Jane Manager",
  "email": "admin1@gmail.com",
  "password": "mypassword123"
}
```

- **Success Response (200 OK):**

```json
{ "message": "Admin registered successfully. You can now login." }
```

### 1.2 Login Admin

Authenticates an admin and provides a JWT token.

- **Endpoint:** `POST /api/auth/login`
- **Request Body:**

```json
{
  "email": "admin1@gmail.com",
  "password": "mypassword123"
}
```

- **Success Response (200 OK):**

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "hotel_id": "hotel1"
}
```

- **Usage Reminder:** Copy the `token` and pass it in the headers for Protected routes:  
  `Authorization: Bearer <your_token>`

### 1.3 Get All Admins

Retrieves a list of all registered manager accounts (passwords are securely hidden).

- **Endpoint:** `GET /api/auth/admins`
- **Success Response:**

```json
[
  {
    "id": 1,
    "hotel_id": "hotel1",
    "name": "Jane Manager",
    "email": "admin1@gmail.com",
    "role": "manager"
  }
]
```

---

## 📁 2. Media Upload APIs (Cloudflare R2 / S3)

Used to upload images/videos and get public URLs back.
_Note: These endpoint strictly expect `multipart/form-data` instead of JSON._

### 2.1 Upload Single File

- **Endpoint:** `POST /api/upload/single`
- **Request Payload (Form-Data):**
  - Key: `file`, Value: `<Target File>`
- **Success Response (200 OK):**

```json
{
  "status": "success",
  "url": "https://pub-88afeabf54f2415b9645cbc9051195e8.r2.dev/1726598371-123456789.jpg"
}
```

### 2.2 Upload Multiple Files

Upload up to 10 files simultaneously.

- **Endpoint:** `POST /api/upload/multiple`
- **Request Payload (Form-Data):**
  - Key: `files`, Value: `<Multiple Target Files>`
- **Success Response (200 OK):**

```json
{
  "status": "success",
  "urls": [
    "https://pub-88afeabf54f2415b9645cbc9051195e8.r2.dev/1726598371-111.jpg",
    "https://pub-88afeabf54f2415b9645cbc9051195e8.r2.dev/1726598371-222.jpg"
  ]
}
```

---

## 🏨 3. Hotel APIs

APIs to manage hotel listings.

### 3.1 Create Hotel

Creates a new listing.

- **Endpoint:** `POST /api/hotels`
- **Request Body (Example):**

```json
{
  "hotel_id": "hotel1",
  "media_urls": ["image1_link", "image2_link"],
  "ameneties": ["air conditioning", "washing machine", "kitchen"],
  "mob_no": "9983798590",
  "address": "124-12 b wani , jaipur 202033",
  "mail_id": "abc@gmail.com",
  "city": "jaipur",
  "latitude": 12.0213,
  "longitude": 69.49182,
  "map_link": "https://maps.app.goo.gl/",
  "description": "clean hotel",
  "room": [{ "deluxe": "price1" }],
  "admins": ["admin1@gmail.com"]
}
```

- **Success Response:** `{ "message": "Hotel successfully created" }`

### 3.2 Get All Hotels

Fetches all listed hotels in the database.

- **Endpoint:** `GET /api/hotels`
- **Success Response:** Array of hotel objects `[ { "hotel_id": "hotel1", "city": "jaipur", ... }, ... ]`

### 3.3 Get One Hotel

Fetches details by unique hotel ID.

- **Endpoint:** `GET /api/hotels/:id` (e.g. `/api/hotels/hotel1`)
- **Success Response:** Single hotel JSON object. If missing: `{ "message": "Hotel not found" }`

### 3.4 Get Hotels By City

Fetches list of hotels corresponding to a specified city name.

- **Endpoint:** `GET /api/hotels/city/:city` (e.g. `/api/hotels/city/jaipur`)
- **Success Response:** Array of hotel objects matching the city.

### 3.5 Update Hotel 🛡️ _(PROTECTED)_

Modifies an existing hotel. Requires the admin to be logged in and specifically associated with the target `hotel_id`.

- **Endpoint:** `PUT /api/hotels/:id`
- **Headers:** `Authorization: Bearer <your_jwt_token>`
- **Request Body:** Send only the fields you wish to update.

```json
{
  "description": "Updated clean hotel description",
  "mob_no": "1111111111"
}
```

- **Success Response:** `{ "message": "Hotel successfully updated" }`
- **Error Response:** `{ "error": "Forbidden: You are not the admin of this hotel" }` (HTTP 403)

### 3.6 Delete Hotel 🛡️ _(PROTECTED)_

Removes a hotel from the system entirely.

- **Endpoint:** `DELETE /api/hotels/:id`
- **Headers:** `Authorization: Bearer <your_jwt_token>`
- **Success Response:** `{ "message": "Hotel successfully deleted" }`

---

## 📅 4. Booking APIs

APIs to trace hotel bookings.

### 4.1 Create Booking

- **Endpoint:** `POST /api/bookings`
- **Request Body:**

```json
{
  "booking_id": "12314124",
  "hotel_id": "hotel1",
  "mobile": "99999999",
  "room": "deluxe",
  "check_in_month": 4,
  "check_in_year": 10,
  "check_in_hr": 14,
  "check_in_min": 12,
  "check_in_day": 22,
  "no_of_guests": 3,
  "name": "yug garg"
}
```

- **Success Response:** `{ "message": "Booking successfully created" }`

### 4.2 Get All Bookings

- **Endpoint:** `GET /api/bookings`
- **Success Response:** Array of all booking objects.

### 4.3 Get One Booking

- **Endpoint:** `GET /api/bookings/:id`
- **Success Response:** Booking object matching `booking_id`.

### 4.4 Get Bookings By Hotel ID

Fetches all bookings meant for a specific hotel.

- **Endpoint:** `GET /api/bookings/hotel/:hotel_id`
- **Success Response:** Array of booking objects matching that hotel.

### 4.5 Update Booking

- **Endpoint:** `PUT /api/bookings/:id`
- **Request Body:** Send fields to update.

```json
{
  "no_of_guests": 4,
  "mobile": "88888888"
}
```

- **Success Response:** `{ "message": "Booking successfully updated" }`

### 4.6 Delete Booking

- **Endpoint:** `DELETE /api/bookings/:id`
- **Success Response:** `{ "message": "Booking successfully deleted" }`

---

## 🌆 5. City APIs

APIs to maintain cities lists to display on geographical filters/maps.

### 5.1 Create City

- **Endpoint:** `POST /api/cities`
- **Request Body:**

```json
{
  "city": "jaipur",
  "hotel_ids": ["hotel_id1", "hotel_id2"],
  "longitude": 12.1234276,
  "latitude": 80.3472873
}
```

- **Success Response:** `{ "message": "City successfully created" }`

### 5.2 Get All Cities

- **Endpoint:** `GET /api/cities`
- **Success Response:** Array of city objects.

### 5.3 Get One City

- **Endpoint:** `GET /api/cities/:city` (e.g., `/api/cities/jaipur`)
- **Success Response:** Single city object.

### 5.4 Update City

- **Endpoint:** `PUT /api/cities/:city`
- **Request Body:**

```json
{
  "longitude": 13.0,
  "latitude": 81.0
}
```

- **Success Response:** `{ "message": "City successfully updated" }`

### 5.5 Delete City

- **Endpoint:** `DELETE /api/cities/:city`
- **Success Response:** `{ "message": "City successfully deleted" }`
